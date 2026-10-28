import { createServer } from "node:http";
import type { AddressInfo } from "node:net";

/** Imita as rotas internas de catálogo do os-service (envelope { status, success, data } e x-internal-api-key). */
export async function iniciarOsStub(apiKey: string, catalogo: { servicos: unknown[]; insumos: unknown[] }) {
	const chamadas: string[] = [];
	const servidor = createServer((req, res) => {
		chamadas.push(req.url ?? "");
		const dados =
			req.url === "/internal/catalogo/servicos"
				? catalogo.servicos
				: req.url === "/internal/catalogo/insumos"
					? catalogo.insumos
					: null;
		const [status, corpo] =
			req.headers["x-internal-api-key"] !== apiKey
				? [401, { status: 401, success: false, message: "chave inválida" }]
				: dados === null
					? [404, { status: 404, success: false }]
					: [200, { status: 200, success: true, data: dados }];
		res.writeHead(status, { "content-type": "application/json" }).end(JSON.stringify(corpo));
	});
	await new Promise<void>((ok) => servidor.listen(0, "127.0.0.1", ok));
	const { port } = servidor.address() as AddressInfo;
	return {
		url: `http://127.0.0.1:${port}`,
		chamadas,
		fechar: () => new Promise<void>((ok) => servidor.close(() => ok())),
	};
}
