import { ApiEnvelopedResponse } from "./api-enveloped-response.decorator";

describe("ApiEnvelopedResponse", () => {
	it("retorna função decorator com modelo primitivo String", () => {
		expect(typeof ApiEnvelopedResponse(String)).toBe("function");
	});

	it("retorna função decorator com modelo primitivo em array (isArray: true)", () => {
		expect(typeof ApiEnvelopedResponse(String, { isArray: true })).toBe("function");
	});

	it("retorna função decorator com modelo primitivo Number em array", () => {
		expect(typeof ApiEnvelopedResponse(Number, { isArray: true })).toBe("function");
	});

	it("retorna função decorator sem modelo (schema object genérico)", () => {
		expect(typeof ApiEnvelopedResponse()).toBe("function");
	});

	it("retorna função decorator com status e description personalizados", () => {
		expect(typeof ApiEnvelopedResponse(String, { status: 201, description: "Created" })).toBe("function");
	});
});
