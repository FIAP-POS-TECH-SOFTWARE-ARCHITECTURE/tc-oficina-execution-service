import { correlationIdDaRequisicao } from "./correlation-id.util";

describe("correlationIdDaRequisicao", () => {
	it("prefere o id atribuído pelo pino-http", () => {
		expect(correlationIdDaRequisicao({ id: "req-1", headers: { "x-request-id": "outro" } })).toBe("req-1");
	});

	it("usa o primeiro valor do header x-request-id quando não há id", () => {
		expect(correlationIdDaRequisicao({ headers: { "x-request-id": "gw-1, gw-2" } })).toBe("gw-1");
	});

	it("gera um uuid quando não há nada", () => {
		expect(correlationIdDaRequisicao({ headers: {} })).toMatch(/^[0-9a-f-]{36}$/);
	});
});
