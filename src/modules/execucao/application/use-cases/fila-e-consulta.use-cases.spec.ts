import { ServiceUnavailableException } from "@nestjs/common";
import { Role } from "../../../../common/enums/role.enum";
import { BuscarOrdemUseCase } from "./buscar-ordem.use-case";
import { ConsultarCatalogoUseCase } from "./consultar-catalogo.use-case";
import { ListarFilaUseCase } from "./listar-fila.use-case";
import { PegarProximaOrdemUseCase } from "./pegar-proxima-ordem.use-case";

const ordem = { id: "o-1", fluxoId: "f", osId: "os", numeroOs: "n", etapa: "REPARO", status: "PENDENTE" };

describe("fila, consulta e catálogo", () => {
	it("ListarFila devolve a fila da etapa", async () => {
		const gw = { listarFila: jest.fn().mockResolvedValue([ordem]) };
		expect(await new ListarFilaUseCase(gw as never).execute("REPARO")).toMatchObject({ status: 200, data: [ordem] });
	});

	it.each([
		["DIAGNOSTICO", "DiagnosticoIniciado"],
		["REPARO", "ReparoIniciado"],
	] as const)("PegarProxima %s emite %s com o mecânico do token", async (etapa, tipo) => {
		const gw = {
			pegarProxima: jest.fn(async (p: { montarEvento: (o: unknown) => unknown }) => ({ ...ordem, evento: p.montarEvento(ordem) })),
		};
		const r = await new PegarProximaOrdemUseCase(gw as never).execute(etapa, { id: "m-1", role: Role.MECANICO }, "req-1");
		expect(r.status).toBe(200);
		expect((r.data as { evento: unknown }).evento).toMatchObject({
			tipo,
			origem: "execution",
			correlationId: "req-1",
			payload: { mecanicoId: "m-1" },
		});
		expect(gw.pegarProxima.mock.calls[0][0]).toMatchObject({ etapa, mecanicoId: "m-1", agora: expect.any(Date) });
	});

	it("PegarProxima com fila vazia → 404", async () => {
		const gw = { pegarProxima: jest.fn().mockResolvedValue(null) };
		expect(
			await new PegarProximaOrdemUseCase(gw as never).execute("DIAGNOSTICO", { id: "m", role: Role.MECANICO }, "c"),
		).toMatchObject({
			status: 404,
			message: "Nenhuma ordem pendente na fila de DIAGNOSTICO",
		});
	});

	it("BuscarOrdem devolve ordem + histórico ou 404", async () => {
		const gw = {
			buscarPorId: jest.fn().mockResolvedValueOnce(ordem).mockResolvedValueOnce(null),
			listarHistorico: jest.fn().mockResolvedValue([{ id: "h" }]),
		};
		const uc = new BuscarOrdemUseCase(gw as never);
		expect(await uc.execute("o-1")).toMatchObject({ status: 200, data: { ...ordem, historico: [{ id: "h" }] } });
		expect((await uc.execute("x")).status).toBe(404);
	});

	it("ConsultarCatalogo repassa as listas e deixa o 503 subir", async () => {
		const catalogo = {
			listarServicos: jest.fn().mockResolvedValue([{ id: "s" }]),
			listarInsumos: jest.fn().mockRejectedValue(new ServiceUnavailableException("fora")),
		};
		const uc = new ConsultarCatalogoUseCase(catalogo);
		expect(await uc.servicos()).toMatchObject({ status: 200, data: [{ id: "s" }] });
		await expect(uc.insumos()).rejects.toBeInstanceOf(ServiceUnavailableException);
	});
});
