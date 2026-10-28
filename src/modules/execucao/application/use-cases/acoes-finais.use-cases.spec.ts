import { Role } from "../../../../common/enums/role.enum";
import { ValidadorContratos } from "../../../mensageria/validador-contratos";
import { ConcluirReparoUseCase } from "./concluir-reparo.use-case";
import { DeclararReparoInviavelUseCase } from "./declarar-reparo-inviavel.use-case";
import { RejeitarDiagnosticoUseCase } from "./rejeitar-diagnostico.use-case";

const ordem = {
	id: "o-1",
	fluxoId: "3f2a1c9e-8b7d-4e6f-a5b4-c3d2e1f0a9b8",
	osId: "9c8b7a6d-5e4f-4a3b-8c2d-1e0f9a8b7c6d",
	numeroOs: "OS-1",
};
const usuario = { id: "5d6e7f8a-9b0c-4d1e-8f2a-3b4c5d6e7f8a", role: Role.MECANICO };
const executor = () => ({
	carregarParaAcao: jest.fn().mockResolvedValue({ ordem }),
	aplicar: jest.fn().mockResolvedValue({ status: 200 }),
});
const comErro = () => Object.assign(executor(), { carregarParaAcao: jest.fn().mockResolvedValue({ erro: { status: 422 } }) });
const validador = new ValidadorContratos();

describe("ações finais da ordem", () => {
	it("rejeitar diagnóstico", async () => {
		const ex = executor();
		await new RejeitarDiagnosticoUseCase(ex as never).execute("o-1", "Motor fundido", usuario, "c");
		const [, , acao, plano] = ex.aplicar.mock.calls[0];
		expect(acao).toBe("REJEITAR_DIAGNOSTICO");
		expect(plano.dados).toMatchObject({ motivo: "Motor fundido" });
		expect(plano.eventos[0]).toMatchObject({
			tipo: "DiagnosticoRejeitado",
			payload: { mecanicoId: usuario.id, motivo: "Motor fundido" },
		});
		expect(validador.validar(plano.eventos[0]).valido).toBe(true);
	});

	it("concluir reparo conclui os itens de serviço pendentes no mesmo instante do evento", async () => {
		const ex = executor();
		await new ConcluirReparoUseCase(ex as never).execute("o-1", usuario, "c");
		const [, , acao, plano] = ex.aplicar.mock.calls[0];
		expect(acao).toBe("CONCLUIR_REPARO");
		expect(plano.concluirItensServicoEm).toBeInstanceOf(Date);
		expect(plano.eventos[0].payload).toEqual({ mecanicoId: usuario.id, concluidoEm: plano.concluirItensServicoEm.toISOString() });
		expect(validador.validar(plano.eventos[0]).valido).toBe(true);
	});

	it("reparo inviável emite ReparoInviavel (gatilho da compensação com estorno)", async () => {
		const ex = executor();
		await new DeclararReparoInviavelUseCase(ex as never).execute("o-1", "Peça fora de linha", usuario, "c");
		const [, , acao, plano] = ex.aplicar.mock.calls[0];
		expect(acao).toBe("DECLARAR_INVIAVEL");
		expect(plano.eventos[0]).toMatchObject({
			tipo: "ReparoInviavel",
			payload: { mecanicoId: usuario.id, motivo: "Peça fora de linha" },
		});
		expect(validador.validar(plano.eventos[0]).valido).toBe(true);
	});

	it.each([
		() => new RejeitarDiagnosticoUseCase(comErro() as never).execute("o", "m", usuario, "c"),
		() => new ConcluirReparoUseCase(comErro() as never).execute("o", usuario, "c"),
		() => new DeclararReparoInviavelUseCase(comErro() as never).execute("o", "m", usuario, "c"),
	])("erro de carregamento é devolvido sem aplicar (%#)", async (chamar) => {
		expect(await chamar()).toEqual({ status: 422 });
	});
});
