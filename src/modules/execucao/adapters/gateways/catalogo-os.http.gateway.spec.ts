import { ServiceUnavailableException } from "@nestjs/common";
import { CatalogoOsHttpGateway } from "./catalogo-os.http.gateway";

const servico = { id: "s-1", nome: "Troca de óleo", descricao: null, precoCentavos: 12000, tempoEstimadoMin: 30 };
const resposta = (status: number, corpo: unknown) =>
	({ ok: status >= 200 && status < 300, status, json: () => Promise.resolve(corpo) }) as Response;

function sut(fetchFn: jest.Mock) {
	let agora = 1_000_000;
	const gw = new CatalogoOsHttpGateway({
		baseUrl: "http://os-service.homolog.svc.cluster.local/",
		apiKey: "k",
		fetchFn,
		agora: () => agora,
	});
	return { gw, avancar: (ms: number) => (agora += ms) };
}

describe("CatalogoOsHttpGateway", () => {
	it("chama a rota interna com a chave e lê `data` do envelope do os-service", async () => {
		const fetchFn = jest.fn().mockResolvedValue(resposta(200, { status: 200, success: true, data: [servico] }));
		await expect(sut(fetchFn).gw.listarServicos()).resolves.toEqual([servico]);
		const [url, init] = fetchFn.mock.calls[0];
		expect(url).toBe("http://os-service.homolog.svc.cluster.local/internal/catalogo/servicos");
		expect(init.headers).toEqual({ "x-internal-api-key": "k", accept: "application/json" });
		expect(init.signal).toBeInstanceOf(AbortSignal);
	});

	it("tolera array puro", async () => {
		const fetchFn = jest.fn().mockResolvedValue(resposta(200, [{ id: "i-1" }]));
		await expect(sut(fetchFn).gw.listarInsumos()).resolves.toEqual([{ id: "i-1" }]);
		expect(fetchFn.mock.calls[0][0]).toMatch(/\/internal\/catalogo\/insumos$/);
	});

	it("cache de 60 s por lista; ignorarCache revalida", async () => {
		const fetchFn = jest.fn().mockResolvedValue(resposta(200, { data: [servico] }));
		const { gw, avancar } = sut(fetchFn);
		await gw.listarServicos();
		await gw.listarServicos();
		expect(fetchFn).toHaveBeenCalledTimes(1);
		await gw.listarServicos({ ignorarCache: true });
		expect(fetchFn).toHaveBeenCalledTimes(2);
		avancar(60_001);
		await gw.listarServicos();
		expect(fetchFn).toHaveBeenCalledTimes(3);
	});

	it.each([
		["timeout", Object.assign(new Error("aborted"), { name: "TimeoutError" }), "sem resposta em 3000ms"],
		["rede", new Error("ECONNREFUSED"), "ECONNREFUSED"],
	])("%s → 503", async (_caso, erro, trecho) => {
		const promessa = sut(jest.fn().mockRejectedValue(erro)).gw.listarServicos();
		await expect(promessa).rejects.toBeInstanceOf(ServiceUnavailableException);
		await expect(promessa).rejects.toThrow(trecho);
	});

	it.each([
		[401, "verifique INTERNAL_API_KEY"],
		[500, "HTTP 500"],
	])("HTTP %i → 503 com mensagem clara", async (status, trecho) => {
		await expect(sut(jest.fn().mockResolvedValue(resposta(status, {}))).gw.listarServicos()).rejects.toThrow(trecho);
	});

	it("corpo inesperado → 503 e nada entra no cache", async () => {
		const fetchFn = jest.fn().mockResolvedValue(resposta(200, { data: "x" }));
		const { gw } = sut(fetchFn);
		await expect(gw.listarServicos()).rejects.toThrow("formato inesperado");
		fetchFn.mockResolvedValue({ ...resposta(200, {}), json: () => Promise.reject(new Error("json")) });
		await expect(gw.listarServicos()).rejects.toThrow("formato inesperado");
		expect(fetchFn).toHaveBeenCalledTimes(2);
	});
});
