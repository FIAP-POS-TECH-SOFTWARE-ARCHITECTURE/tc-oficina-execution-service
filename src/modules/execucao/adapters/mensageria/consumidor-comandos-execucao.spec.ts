import { criarEnvelope } from "../../../mensageria/envelope";
import { MensagemJaProcessadaError } from "../../application/ports/ordens-execucao.gateway";
import { ConsumidorComandosExecucao } from "./consumidor-comandos-execucao";

const env = (tipo: string) => criarEnvelope({ tipo, fluxoId: "f", osId: "o", numeroOs: "n", correlationId: "c", payload: {} });

function sut() {
	const consumidor = { iniciar: jest.fn(), parar: jest.fn() };
	const enfileirar = { diagnostico: jest.fn(), reparo: jest.fn() };
	const cancelar = { execute: jest.fn() };
	return {
		consumidor,
		enfileirar,
		cancelar,
		adapter: new ConsumidorComandosExecucao(consumidor as never, enfileirar as never, cancelar as never),
	};
}

describe("ConsumidorComandosExecucao", () => {
	const envOriginal = { ...process.env };
	afterEach(() => (process.env = { ...envOriginal }));

	it.each([
		["SolicitarDiagnostico", "diagnostico"],
		["IniciarReparo", "reparo"],
	] as const)("%s → enfileirar.%s", async (tipo, metodo) => {
		const { enfileirar, adapter } = sut();
		await adapter.processar(env(tipo));
		expect(enfileirar[metodo]).toHaveBeenCalled();
	});

	it("CancelarExecucao → cancelar", async () => {
		const { cancelar, adapter } = sut();
		await adapter.processar(env("CancelarExecucao"));
		expect(cancelar.execute).toHaveBeenCalled();
	});

	it("duplicata detectada na transação é engolida (a mensagem será apagada)", async () => {
		const { enfileirar, adapter } = sut();
		enfileirar.diagnostico.mockRejectedValue(new MensagemJaProcessadaError("m"));
		await expect(adapter.processar(env("SolicitarDiagnostico"))).resolves.toBeUndefined();
	});

	it("tipo que não é comando desta fila lança (não apaga → DLQ)", async () => {
		await expect(sut().adapter.processar(env("GerarOrcamento"))).rejects.toThrow(
			"Tipo não suportado na fila de comandos do execution: GerarOrcamento",
		);
	});

	it("bootstrap consome só a origem os; desligado com WORKERS_HABILITADOS=false; shutdown para", async () => {
		process.env.SQS_EXECUCAO_COMANDOS_URL = "http://fila";
		const { consumidor, adapter } = sut();
		process.env.WORKERS_HABILITADOS = "false";
		adapter.onApplicationBootstrap();
		expect(consumidor.iniciar).not.toHaveBeenCalled();
		delete process.env.WORKERS_HABILITADOS;
		adapter.onApplicationBootstrap();
		expect(consumidor.iniciar).toHaveBeenCalledWith("http://fila", expect.any(Function), ["os"]);
		await adapter.onApplicationShutdown();
		expect(consumidor.parar).toHaveBeenCalled();
	});
});
