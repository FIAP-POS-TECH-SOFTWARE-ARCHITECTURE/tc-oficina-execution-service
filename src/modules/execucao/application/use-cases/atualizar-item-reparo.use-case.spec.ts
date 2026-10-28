import { Role } from "../../../../common/enums/role.enum";
import { TransicaoConcorrenteError } from "../../domain/erros-execucao";
import { AtualizarItemReparoUseCase } from "./atualizar-item-reparo.use-case";

const servico = { id: "i-1", tipo: "SERVICO", nome: "Troca de óleo", status: "PENDENTE" };
const ordem = { id: "o-1", itens: [servico, { id: "i-2", tipo: "INSUMO", nome: "Óleo", status: null }] };
const usuario = { id: "m", role: Role.MECANICO };

function sut(o: unknown = ordem) {
	const executor = { carregarParaAcao: jest.fn().mockResolvedValue({ ordem: o }) };
	const gw = { atualizarItem: jest.fn().mockResolvedValue(ordem) };
	return { executor, gw, uc: new AtualizarItemReparoUseCase(executor as never, gw as never) };
}

describe("AtualizarItemReparoUseCase", () => {
	it("inicia serviço pendente", async () => {
		const { gw, uc } = sut();
		expect((await uc.execute("o-1", "i-1", "INICIAR", usuario)).status).toBe(200);
		expect(gw.atualizarItem).toHaveBeenCalledWith(
			expect.objectContaining({
				ordemId: "o-1",
				itemId: "i-1",
				de: "PENDENTE",
				para: "EM_EXECUCAO",
				usuarioId: "m",
				observacao: "Serviço Troca de óleo iniciado",
			}),
		);
	});

	it("conclui serviço em execução", async () => {
		const { gw, uc } = sut({ ...ordem, itens: [{ ...servico, status: "EM_EXECUCAO" }] });
		await uc.execute("o-1", "i-1", "CONCLUIR", usuario);
		expect(gw.atualizarItem.mock.calls[0][0]).toMatchObject({
			de: "EM_EXECUCAO",
			para: "CONCLUIDO",
			observacao: "Serviço Troca de óleo concluído",
		});
	});

	it.each([
		["i-2", "INICIAR", 404],
		["x", "INICIAR", 404],
		["i-1", "CONCLUIR", 422],
	] as const)("item %s %s → %i", async (itemId, op, status) => {
		expect((await sut().uc.execute("o-1", itemId, op, usuario)).status).toBe(status);
	});

	it("erro de carregamento é devolvido; corrida vira 422", async () => {
		const a = sut();
		a.executor.carregarParaAcao.mockResolvedValue({ erro: { status: 403 } });
		expect(await a.uc.execute("o-1", "i-1", "INICIAR", usuario)).toEqual({ status: 403 });
		const b = sut();
		b.gw.atualizarItem.mockRejectedValue(new TransicaoConcorrenteError("o-1"));
		expect((await b.uc.execute("o-1", "i-1", "INICIAR", usuario)).status).toBe(422);
	});
});
