import { ServiceUnavailableException } from "@nestjs/common";
import { Role } from "../../../../common/enums/role.enum";
import { ValidadorContratos } from "../../../mensageria/validador-contratos";
import { RegistrarDiagnosticoUseCase } from "./registrar-diagnostico.use-case";

const S = "2b3c4d5e-6f7a-4b8c-9d0e-1f2a3b4c5d6e";
const I = "3c4d5e6f-7a8b-4c9d-8e1f-2a3b4c5d6e7f";
const ordem = {
	id: "o-1",
	fluxoId: "3f2a1c9e-8b7d-4e6f-a5b4-c3d2e1f0a9b8",
	osId: "9c8b7a6d-5e4f-4a3b-8c2d-1e0f9a8b7c6d",
	numeroOs: "OS-1",
	etapa: "DIAGNOSTICO",
	status: "EM_ANDAMENTO",
	mecanicoId: "5d6e7f8a-9b0c-4d1e-8f2a-3b4c5d6e7f8a",
};
const usuario = { id: ordem.mecanicoId, role: Role.MECANICO };
const entrada = {
	diagnostico: "Troca de óleo e filtro",
	itens: [
		{ tipo: "SERVICO" as const, referenciaId: S, quantidade: 1 },
		{ tipo: "INSUMO" as const, referenciaId: I, quantidade: 4 },
	],
};

function sut() {
	const executor = {
		carregarParaAcao: jest.fn().mockResolvedValue({ ordem }),
		aplicar: jest.fn().mockResolvedValue({ status: 200 }),
	};
	const catalogo = {
		listarServicos: jest.fn().mockResolvedValue([{ id: S, nome: "Troca de óleo", tempoEstimadoMin: 30 }]),
		listarInsumos: jest.fn().mockResolvedValue([{ id: I, nome: "Óleo 5W30" }]),
	};
	return { executor, catalogo, uc: new RegistrarDiagnosticoUseCase(executor as never, catalogo) };
}

describe("RegistrarDiagnosticoUseCase", () => {
	it("conclui com itens do catálogo e emite DiagnosticoConcluido no formato do contrato", async () => {
		const { executor, uc } = sut();
		expect((await uc.execute("o-1", entrada, usuario, "req-1")).status).toBe(200);
		const [, , acao, plano] = executor.aplicar.mock.calls[0];
		expect(acao).toBe("CONCLUIR_DIAGNOSTICO");
		expect(plano.dados).toMatchObject({ diagnostico: "Troca de óleo e filtro", finalizadaEm: expect.any(Date) });
		expect(plano.itensNovos).toEqual([
			{ tipo: "SERVICO", referenciaId: S, itemOsId: null, nome: "Troca de óleo", quantidade: 1, tempoEstimadoMin: 30, status: null },
			{ tipo: "INSUMO", referenciaId: I, itemOsId: null, nome: "Óleo 5W30", quantidade: 4, tempoEstimadoMin: null, status: null },
		]);
		const [evento] = plano.eventos;
		expect(evento.payload).toEqual({ mecanicoId: usuario.id, diagnostico: entrada.diagnostico, itens: entrada.itens });
		expect(new ValidadorContratos().validar(evento).valido).toBe(true);
	});

	it("erro de carregamento (404/403/422) é devolvido sem consultar o catálogo", async () => {
		const { executor, catalogo, uc } = sut();
		executor.carregarParaAcao.mockResolvedValue({ erro: { status: 403 } });
		expect(await uc.execute("o-1", entrada, usuario, "c")).toEqual({ status: 403 });
		expect(catalogo.listarServicos).not.toHaveBeenCalled();
	});

	it("item repetido → 422", async () => {
		const { uc } = sut();
		const r = await uc.execute("o-1", { ...entrada, itens: [entrada.itens[0], entrada.itens[0]] }, usuario, "c");
		expect(r).toMatchObject({ status: 422, message: `Item repetido no diagnóstico: SERVICO ${S}` });
	});

	it("item fora do catálogo: revalida sem cache e então 422 sem gravar", async () => {
		const { executor, catalogo, uc } = sut();
		const fantasma = "11111111-1111-4111-8111-111111111111";
		const r = await uc.execute(
			"o-1",
			{ ...entrada, itens: [{ tipo: "SERVICO", referenciaId: fantasma, quantidade: 1 }] },
			usuario,
			"c",
		);
		expect(r).toMatchObject({ status: 422, message: `Itens fora do catálogo ativo do OS: SERVICO ${fantasma}` });
		expect(catalogo.listarServicos).toHaveBeenNthCalledWith(2, { ignorarCache: true });
		expect(catalogo.listarInsumos).not.toHaveBeenCalled();
		expect(executor.aplicar).not.toHaveBeenCalled();
	});

	it("item novo encontrado na revalidação é aceito", async () => {
		const { catalogo, uc } = sut();
		catalogo.listarInsumos.mockResolvedValueOnce([]).mockResolvedValueOnce([{ id: I, nome: "Óleo 5W30" }]);
		expect((await uc.execute("o-1", entrada, usuario, "c")).status).toBe(200);
	});

	it("OS indisponível → 503 sobe sem gravar", async () => {
		const { executor, catalogo, uc } = sut();
		catalogo.listarServicos.mockRejectedValue(new ServiceUnavailableException("Catálogo do OS indisponível"));
		await expect(uc.execute("o-1", entrada, usuario, "c")).rejects.toBeInstanceOf(ServiceUnavailableException);
		expect(executor.aplicar).not.toHaveBeenCalled();
	});
});
