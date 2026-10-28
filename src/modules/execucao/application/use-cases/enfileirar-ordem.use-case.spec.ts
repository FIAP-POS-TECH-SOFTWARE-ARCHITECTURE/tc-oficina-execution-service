import { criarEnvelope } from "../../../mensageria/envelope";
import { FluxoCanceladoError } from "../../domain/erros-execucao";
import { EnfileirarOrdemUseCase } from "./enfileirar-ordem.use-case";

const base = { fluxoId: "f-1", osId: "os-1", numeroOs: "OS-1", correlationId: "req-1" };
const solicitar = criarEnvelope({
	...base,
	tipo: "SolicitarDiagnostico",
	payload: {
		cliente: { id: "c", nome: "Maria" },
		veiculo: { id: "v", placa: "ABC1D23", marca: "Fiat", modelo: "Argo", ano: 2022 },
		observacoesAtendimento: "barulho",
	},
});
const iniciarReparo = criarEnvelope({
	...base,
	tipo: "IniciarReparo",
	payload: {
		itensServico: [{ itemId: "io-1", servicoId: "s-1", nome: "Troca", quantidade: 1, tempoEstimadoMin: 30 }],
		itensInsumo: [{ insumoId: "i-1", nome: "Óleo", quantidade: 4 }],
	},
});

function sut() {
	const gw = {
		buscarFluxoCancelado: jest.fn().mockResolvedValue(null),
		buscarPorOsEEtapa: jest.fn().mockResolvedValue(null),
		criarOrdem: jest.fn().mockResolvedValue({}),
		registrarSemEfeito: jest.fn(),
	};
	return { gw, uc: new EnfileirarOrdemUseCase(gw as never) };
}
const eventoDe = (mock: jest.Mock) => mock.mock.calls[0][0].eventos[0];

describe("EnfileirarOrdemUseCase", () => {
	it("cria ordem de diagnóstico PENDENTE com snapshot e ExecucaoEnfileirada", async () => {
		const { gw, uc } = sut();
		await uc.diagnostico(solicitar);
		const { ordem, mensagem } = gw.criarOrdem.mock.calls[0][0];
		expect(ordem).toMatchObject({
			fluxoId: "f-1",
			osId: "os-1",
			numeroOs: "OS-1",
			etapa: "DIAGNOSTICO",
			cliente: { nome: "Maria" },
			observacoesAtendimento: "barulho",
			itens: [],
		});
		expect(mensagem).toEqual({ messageId: solicitar.messageId, tipo: "SolicitarDiagnostico" });
		expect(eventoDe(gw.criarOrdem)).toMatchObject({
			tipo: "ExecucaoEnfileirada",
			origem: "execution",
			correlationId: "req-1",
			payload: { etapa: "DIAGNOSTICO", ordemExecucaoId: ordem.id },
		});
	});

	it("regra 2: ordem já existente reemite ExecucaoEnfileirada sem criar", async () => {
		const { gw, uc } = sut();
		gw.buscarPorOsEEtapa.mockResolvedValue({ id: "o-9" });
		await uc.diagnostico(solicitar);
		expect(gw.criarOrdem).not.toHaveBeenCalled();
		expect(eventoDe(gw.registrarSemEfeito).payload).toEqual({ etapa: "DIAGNOSTICO", ordemExecucaoId: "o-9" });
	});

	it("regra 4: fluxo cancelado antes → não cria e reemite ExecucaoCancelada{etapa:null}", async () => {
		const { gw, uc } = sut();
		gw.buscarFluxoCancelado.mockResolvedValue({ motivo: "OS cancelada" });
		await uc.reparo(iniciarReparo);
		expect(gw.criarOrdem).not.toHaveBeenCalled();
		expect(eventoDe(gw.registrarSemEfeito)).toMatchObject({
			tipo: "ExecucaoCancelada",
			payload: { etapa: null, motivo: "OS cancelada" },
		});
	});

	it("corrida perdida para o cancelamento → reemite ExecucaoCancelada{etapa:null}", async () => {
		const { gw, uc } = sut();
		gw.criarOrdem.mockRejectedValue(new FluxoCanceladoError("f-1", "prazo"));
		await uc.diagnostico(solicitar);
		expect(eventoDe(gw.registrarSemEfeito)).toMatchObject({ tipo: "ExecucaoCancelada", payload: { etapa: null, motivo: "prazo" } });
	});

	it("outros erros sobem (mensagem volta à fila)", async () => {
		const { gw, uc } = sut();
		gw.criarOrdem.mockRejectedValue(new Error("banco fora"));
		await expect(uc.diagnostico(solicitar)).rejects.toThrow("banco fora");
	});

	it("reparo copia snapshot do diagnóstico e monta itens", async () => {
		const { gw, uc } = sut();
		gw.buscarPorOsEEtapa.mockImplementation((_os: string, etapa: string) =>
			Promise.resolve(
				etapa === "DIAGNOSTICO"
					? { id: "d-1", cliente: { id: "c", nome: "Maria" }, veiculo: null, observacoesAtendimento: "x" }
					: null,
			),
		);
		await uc.reparo(iniciarReparo);
		const { ordem } = gw.criarOrdem.mock.calls[0][0];
		expect(ordem).toMatchObject({ etapa: "REPARO", cliente: { nome: "Maria" }, observacoesAtendimento: "x" });
		expect(ordem.itens).toEqual([
			{
				tipo: "SERVICO",
				referenciaId: "s-1",
				itemOsId: "io-1",
				nome: "Troca",
				quantidade: 1,
				tempoEstimadoMin: 30,
				status: "PENDENTE",
			},
			{ tipo: "INSUMO", referenciaId: "i-1", itemOsId: null, nome: "Óleo", quantidade: 4, tempoEstimadoMin: null, status: null },
		]);
	});

	it("reparo sem ordem de diagnóstico registrada cria sem snapshot", async () => {
		const { gw, uc } = sut();
		await uc.reparo(iniciarReparo);
		expect(gw.criarOrdem.mock.calls[0][0].ordem).toMatchObject({ cliente: null, veiculo: null, observacoesAtendimento: null });
	});
});
