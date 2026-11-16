import { criarEnvelope } from "../../../mensageria/envelope";
import { CancelarExecucaoUseCase } from "./cancelar-execucao.use-case";

const cancelar = criarEnvelope({
	fluxoId: "f-1",
	osId: "os-1",
	numeroOs: "OS-1",
	correlationId: "c",
	tipo: "CancelarExecucao",
	payload: { motivo: "OS cancelada" },
});
function sut(ordens: unknown[]) {
	const gw = { listarPorOs: jest.fn().mockResolvedValue(ordens), transicionar: jest.fn(), registrarCancelamentoDoFluxo: jest.fn() };
	return { gw, uc: new CancelarExecucaoUseCase(gw as never) };
}

describe("CancelarExecucaoUseCase", () => {
	it("cancela a ordem ativa, registra o fluxo e emite ExecucaoCancelada com a etapa", async () => {
		const { gw, uc } = sut([
			{ id: "o-2", etapa: "REPARO", status: "EM_ANDAMENTO" },
			{ id: "o-1", etapa: "DIAGNOSTICO", status: "CONCLUIDA" },
		]);
		await uc.execute(cancelar);
		const t = gw.transicionar.mock.calls[0][0];
		expect(t).toMatchObject({
			ordemId: "o-2",
			de: ["PENDENTE", "EM_ANDAMENTO"],
			para: "CANCELADA",
			usuarioId: null,
			dados: { motivo: "OS cancelada" },
			registrarFluxoCancelado: { fluxoId: "f-1", osId: "os-1", motivo: "OS cancelada" },
			mensagem: { messageId: cancelar.messageId, tipo: "CancelarExecucao" },
		});
		expect(t.eventos[0]).toMatchObject({ tipo: "ExecucaoCancelada", payload: { etapa: "REPARO", motivo: "OS cancelada" } });
	});

	it("regra 4: sem ordem nenhuma → registra o fluxo e emite etapa null", async () => {
		const { gw, uc } = sut([]);
		await uc.execute(cancelar);
		const d = gw.registrarCancelamentoDoFluxo.mock.calls[0][0];
		expect(d).toMatchObject({ fluxoId: "f-1", osId: "os-1", motivo: "OS cancelada" });
		expect(d.eventos[0].payload).toEqual({ etapa: null, motivo: "OS cancelada" });
	});

	it("regra 2: ordem já cancelada → reemite com a etapa e o motivo dela", async () => {
		const { gw, uc } = sut([{ id: "o-1", etapa: "DIAGNOSTICO", status: "CANCELADA", motivo: "primeiro" }]);
		await uc.execute(cancelar);
		expect(gw.registrarCancelamentoDoFluxo.mock.calls[0][0].eventos[0].payload).toEqual({ etapa: "DIAGNOSTICO", motivo: "primeiro" });
	});

	it("só ordens encerradas (nenhuma cancelada) → etapa null", async () => {
		const { gw, uc } = sut([{ id: "o-1", etapa: "DIAGNOSTICO", status: "CONCLUIDA", motivo: null }]);
		await uc.execute(cancelar);
		expect(gw.registrarCancelamentoDoFluxo.mock.calls[0][0].eventos[0].payload.etapa).toBeNull();
	});
});
