import { Role } from "../../../../common/enums/role.enum";
import { criarEventoExecucao } from "../eventos-execucao";
import { TransicaoConcorrenteError } from "../../domain/erros-execucao";
import { ExecutorAcaoOrdem } from "./executor-acao-ordem";

const ordem = (s: Record<string, unknown> = {}) => ({
	id: "o-1",
	fluxoId: "f",
	osId: "os",
	numeroOs: "n",
	etapa: "REPARO",
	status: "EM_ANDAMENTO",
	mecanicoId: "m-1",
	itens: [],
	...s,
});
const mecanico = { id: "m-1", role: Role.MECANICO };

function sut(o: unknown = ordem()) {
	const gw = {
		buscarPorId: jest.fn().mockResolvedValue(o),
		transicionar: jest.fn().mockResolvedValue({ ...ordem(), status: "CONCLUIDA" }),
	};
	return { gw, executor: new ExecutorAcaoOrdem(gw as never) };
}

describe("ExecutorAcaoOrdem", () => {
	it.each([
		["inexistente", null, mecanico, 404, "Ordem de execução não encontrada"],
		[
			"de outro mecânico",
			ordem({ mecanicoId: "m-2" }),
			mecanico,
			403,
			"Só o mecânico que pegou a ordem (ou um administrador) pode agir nela",
		],
		[
			"pendente sem mecânico",
			ordem({ status: "PENDENTE", mecanicoId: null }),
			mecanico,
			403,
			"Só o mecânico que pegou a ordem (ou um administrador) pode agir nela",
		],
		["cancelada pelo fluxo", ordem({ status: "CANCELADA" }), mecanico, 422, "Ordem cancelada pelo fluxo da OS; nenhuma ação é aceita"],
		[
			"transição inválida",
			ordem({ etapa: "DIAGNOSTICO" }),
			mecanico,
			422,
			"Ação CONCLUIR_REPARO inválida para ordem de DIAGNOSTICO em EM_ANDAMENTO",
		],
		[
			"admin em ordem pendente",
			ordem({ status: "PENDENTE", mecanicoId: null }),
			{ id: "a", role: Role.ADMINISTRADOR },
			422,
			"Ação CONCLUIR_REPARO inválida para ordem de REPARO em PENDENTE",
		],
	])("%s → %i", async (_c, o, usuario, status, mensagem) => {
		const r = await sut(o).executor.carregarParaAcao("o-1", usuario, "CONCLUIR_REPARO");
		expect("erro" in r && r.erro).toMatchObject({ status, message: mensagem });
	});

	it("dono ou administrador carregam a ordem", async () => {
		expect(await sut().executor.carregarParaAcao("o-1", mecanico, "CONCLUIR_REPARO")).toEqual({ ordem: ordem() });
		expect(
			await sut(ordem({ mecanicoId: "m-2" })).executor.carregarParaAcao(
				"o-1",
				{ id: "a", role: Role.ADMINISTRADOR },
				"CONCLUIR_REPARO",
			),
		).toHaveProperty("ordem");
	});

	it("aplicar transiciona do status de origem ao destino da ação com o plano", async () => {
		const { gw, executor } = sut();
		const evento = criarEventoExecucao(
			ordem() as never,
			"ReparoConcluido",
			{ mecanicoId: "m-1", concluidoEm: new Date().toISOString() },
			"c",
		);
		const r = await executor.aplicar(ordem() as never, mecanico, "CONCLUIR_REPARO", { observacao: "ok", eventos: [evento] });
		expect(r.status).toBe(200);
		expect(gw.transicionar).toHaveBeenCalledWith({
			ordemId: "o-1",
			de: ["EM_ANDAMENTO"],
			para: "CONCLUIDA",
			usuarioId: "m-1",
			observacao: "ok",
			eventos: [evento],
		});
	});

	it("aplicar: ordem mudou entre a leitura e o lock → 422; outro erro sobe", async () => {
		const { gw, executor } = sut();
		gw.transicionar.mockRejectedValueOnce(new TransicaoConcorrenteError("o-1")).mockRejectedValueOnce(new Error("banco fora"));
		expect((await executor.aplicar(ordem() as never, mecanico, "CONCLUIR_REPARO", { observacao: "x", eventos: [] })).status).toBe(422);
		await expect(executor.aplicar(ordem() as never, mecanico, "CONCLUIR_REPARO", { observacao: "x", eventos: [] })).rejects.toThrow(
			"banco fora",
		);
	});
});
