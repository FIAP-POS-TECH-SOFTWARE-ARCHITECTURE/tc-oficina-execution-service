import { Prisma } from "@prisma/client";
import { criarEventoExecucao } from "../../application/eventos-execucao";
import { MensagemJaProcessadaError } from "../../application/ports/ordens-execucao.gateway";
import { FluxoCanceladoError, TransicaoConcorrenteError } from "../../domain/erros-execucao";
import { OrdensExecucaoPrismaGateway } from "./ordens-execucao.prisma.gateway";

const agora = new Date("2026-11-01T10:00:00.000Z");
const ref = { fluxoId: "f-1", osId: "os-1", numeroOs: "OS-2026-000123" };
const registro = (s: Record<string, unknown> = {}) => ({
	...ref,
	id: "o-1",
	etapa: "DIAGNOSTICO",
	status: "PENDENTE",
	mecanicoId: null,
	cliente: { id: "c", nome: "Maria" },
	veiculo: null,
	observacoesAtendimento: null,
	diagnostico: null,
	motivo: null,
	iniciadaEm: null,
	finalizadaEm: null,
	createdAt: agora,
	updatedAt: agora,
	itens: [],
	...s,
});
const evento = criarEventoExecucao(ref, "ExecucaoEnfileirada", {}, "c");
const mensagem = { messageId: "m-1", tipo: "SolicitarDiagnostico" };
const novaOrdem = {
	...ref,
	id: "o-1",
	etapa: "DIAGNOSTICO" as const,
	cliente: { id: "c", nome: "Maria" },
	veiculo: null,
	observacoesAtendimento: null,
	itens: [],
};

function fakes() {
	const tx = {
		$executeRaw: jest.fn().mockResolvedValue(1),
		$queryRaw: jest.fn().mockResolvedValue([{ status: "PENDENTE" }]),
		mensagemProcessada: { createMany: jest.fn().mockResolvedValue({ count: 1 }) },
		fluxoCancelado: { findUnique: jest.fn().mockResolvedValue(null), createMany: jest.fn() },
		ordemExecucao: {
			create: jest.fn(),
			update: jest.fn(),
			count: jest.fn().mockResolvedValue(0),
			findUniqueOrThrow: jest.fn().mockResolvedValue(registro()),
		},
		itemExecucao: { createMany: jest.fn(), updateMany: jest.fn() },
		historicoExecucao: { create: jest.fn() },
		outboxMensagem: { createMany: jest.fn() },
	};
	const prisma = {
		$transaction: jest.fn((fn: (t: typeof tx) => unknown) => fn(tx)),
		ordemExecucao: { findUnique: jest.fn(), findMany: jest.fn() },
		fluxoCancelado: { findUnique: jest.fn() },
	};
	return { tx, prisma, gateway: new OrdensExecucaoPrismaGateway(prisma as never) };
}
const sql = (mock: jest.Mock, i = 0) => (mock.mock.calls[i][0] as string[]).join("?");

describe("OrdensExecucaoPrismaGateway", () => {
	it("leituras mapeiam registro e respeitam a chave única", async () => {
		const { prisma, gateway } = fakes();
		prisma.ordemExecucao.findUnique.mockResolvedValueOnce(null).mockResolvedValueOnce(registro());
		await expect(gateway.buscarPorId("x")).resolves.toBeNull();
		await expect(gateway.buscarPorOsEEtapa("os-1", "REPARO")).resolves.toMatchObject({
			id: "o-1",
			cliente: { nome: "Maria" },
			veiculo: null,
		});
		expect(prisma.ordemExecucao.findUnique.mock.calls[1][0].where).toEqual({ osId_etapa: { osId: "os-1", etapa: "REPARO" } });
		prisma.ordemExecucao.findMany.mockResolvedValue([registro()]);
		await gateway.listarPorOs("os-1");
		expect(prisma.ordemExecucao.findMany.mock.calls[0][0]).toMatchObject({ where: { osId: "os-1" }, orderBy: { createdAt: "desc" } });
		prisma.fluxoCancelado.findUnique.mockResolvedValue({ motivo: "X" });
		await expect(gateway.buscarFluxoCancelado("f-1")).resolves.toEqual({ motivo: "X" });
	});

	it("criarOrdem: dedupe primeiro, lock do fluxo, ordem, histórico e outbox", async () => {
		const { tx, gateway } = fakes();
		await gateway.criarOrdem({ ordem: novaOrdem, eventos: [evento], mensagem });
		expect(tx.mensagemProcessada.createMany).toHaveBeenCalledWith({ data: [mensagem], skipDuplicates: true });
		expect(sql(tx.$executeRaw)).toContain("pg_advisory_xact_lock(hashtext(");
		expect(tx.$executeRaw.mock.calls[0][1]).toBe("f-1");
		expect(tx.ordemExecucao.create.mock.calls[0][0].data).toMatchObject({
			id: "o-1",
			etapa: "DIAGNOSTICO",
			veiculo: Prisma.DbNull,
			itens: { create: [] },
		});
		expect(tx.historicoExecucao.create.mock.calls[0][0].data).toMatchObject({
			statusAnterior: null,
			statusNovo: "PENDENTE",
			messageId: evento.messageId,
		});
		expect(tx.outboxMensagem.createMany).toHaveBeenCalledWith({
			data: [{ messageId: evento.messageId, fluxoId: "f-1", tipo: "ExecucaoEnfileirada", destino: "eventos", corpo: evento }],
		});
	});

	it("criarOrdem: messageId repetido → MensagemJaProcessadaError sem efeito", async () => {
		const { tx, gateway } = fakes();
		tx.mensagemProcessada.createMany.mockResolvedValue({ count: 0 });
		await expect(gateway.criarOrdem({ ordem: novaOrdem, eventos: [evento], mensagem })).rejects.toThrow(MensagemJaProcessadaError);
		expect(tx.ordemExecucao.create).not.toHaveBeenCalled();
	});

	it("criarOrdem: fluxo cancelado sob o lock → FluxoCanceladoError sem criar", async () => {
		const { tx, gateway } = fakes();
		tx.fluxoCancelado.findUnique.mockResolvedValue({ motivo: "OS cancelada" });
		await expect(gateway.criarOrdem({ ordem: novaOrdem, eventos: [evento], mensagem })).rejects.toThrow(FluxoCanceladoError);
		expect(tx.ordemExecucao.create).not.toHaveBeenCalled();
	});

	it("registrarSemEfeito grava só dedupe e outbox", async () => {
		const { tx, gateway } = fakes();
		await gateway.registrarSemEfeito({ eventos: [evento], mensagem });
		expect(tx.mensagemProcessada.createMany).toHaveBeenCalled();
		expect(tx.outboxMensagem.createMany).toHaveBeenCalledTimes(1);
		expect(tx.ordemExecucao.create).not.toHaveBeenCalled();
	});

	it("registrarCancelamentoDoFluxo: grava o fluxo sob lock; com ordem ativa → TransicaoConcorrenteError", async () => {
		const { tx, gateway } = fakes();
		await gateway.registrarCancelamentoDoFluxo({ ...ref, motivo: "M", eventos: [evento], mensagem });
		expect(tx.ordemExecucao.count).toHaveBeenCalledWith({ where: { osId: "os-1", status: { in: ["PENDENTE", "EM_ANDAMENTO"] } } });
		expect(tx.fluxoCancelado.createMany).toHaveBeenCalledWith({
			data: [{ fluxoId: "f-1", osId: "os-1", motivo: "M" }],
			skipDuplicates: true,
		});
		tx.ordemExecucao.count.mockResolvedValue(1);
		await expect(gateway.registrarCancelamentoDoFluxo({ ...ref, motivo: "M", eventos: [evento], mensagem })).rejects.toThrow(
			TransicaoConcorrenteError,
		);
	});

	it("transicionar: FOR UPDATE, confere status, atualiza, itens, histórico, fluxo cancelado e outbox", async () => {
		const { tx, gateway } = fakes();
		tx.$queryRaw.mockResolvedValue([{ status: "EM_ANDAMENTO" }]);
		const item = {
			tipo: "INSUMO" as const,
			referenciaId: "i",
			itemOsId: null,
			nome: "Óleo",
			quantidade: 4,
			tempoEstimadoMin: null,
			status: null,
		};
		await gateway.transicionar({
			ordemId: "o-1",
			de: ["EM_ANDAMENTO"],
			para: "CANCELADA",
			usuarioId: null,
			observacao: "obs",
			dados: { motivo: "M" },
			itensNovos: [item],
			concluirItensServicoEm: agora,
			registrarFluxoCancelado: { ...ref, motivo: "M" },
			eventos: [evento],
			mensagem,
		});
		expect(sql(tx.$queryRaw)).toMatch(/FROM ordens_execucao WHERE id = .*FOR UPDATE/s);
		expect(tx.ordemExecucao.update).toHaveBeenCalledWith({ where: { id: "o-1" }, data: { status: "CANCELADA", motivo: "M" } });
		expect(tx.itemExecucao.createMany).toHaveBeenCalledWith({ data: [{ ...item, ordemExecucaoId: "o-1" }] });
		expect(tx.itemExecucao.updateMany).toHaveBeenCalledTimes(2);
		expect(tx.fluxoCancelado.createMany).toHaveBeenCalled();
		expect(tx.historicoExecucao.create.mock.calls[0][0].data).toMatchObject({
			statusAnterior: "EM_ANDAMENTO",
			statusNovo: "CANCELADA",
		});
	});

	it("transicionar: status travado fora de `de` ou ordem inexistente → TransicaoConcorrenteError sem escrita", async () => {
		const { tx, gateway } = fakes();
		const base = {
			ordemId: "o-1",
			de: ["PENDENTE"] as const,
			para: "EM_ANDAMENTO" as const,
			usuarioId: "u",
			observacao: null,
			eventos: [],
		};
		tx.$queryRaw.mockResolvedValueOnce([{ status: "CANCELADA" }]).mockResolvedValueOnce([]);
		await expect(gateway.transicionar(base)).rejects.toThrow(TransicaoConcorrenteError);
		await expect(gateway.transicionar(base)).rejects.toThrow(TransicaoConcorrenteError);
		expect(tx.ordemExecucao.update).not.toHaveBeenCalled();
		expect(tx.mensagemProcessada.createMany).not.toHaveBeenCalled();
	});
});
