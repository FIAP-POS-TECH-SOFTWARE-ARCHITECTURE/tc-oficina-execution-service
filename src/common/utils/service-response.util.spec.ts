import { SR } from "./service-response.util";

describe("SR helpers", () => {
	it("ok devolve status 200 e success=true", () => {
		const r = SR.ok({ a: 1 }, "ok");
		expect(r.status).toBe(200);
		expect(r.success).toBe(true);
		expect(r.data).toEqual({ a: 1 });
	});

	it("created devolve 201 e success=true", () => {
		const r = SR.created({ id: "x" });
		expect(r.status).toBe(201);
		expect(r.success).toBe(true);
	});

	it("noContent devolve 204", () => {
		const r = SR.noContent("nada");
		expect(r.status).toBe(204);
	});

	it("badRequest devolve 400 e success=false", () => {
		const r = SR.badRequest(undefined, "ruim");
		expect(r.status).toBe(400);
		expect(r.success).toBe(false);
	});

	it("unauthorized devolve 401", () => {
		expect(SR.unauthorized(undefined, "x").status).toBe(401);
	});

	it("forbidden devolve 403", () => {
		expect(SR.forbidden(undefined, "x").status).toBe(403);
	});

	it("notFound devolve 404", () => {
		expect(SR.notFound(undefined, "x").status).toBe(404);
	});

	it("conflict devolve 409", () => {
		expect(SR.conflict(undefined, "x").status).toBe(409);
	});

	it("unprocessableEntity devolve 422", () => {
		expect(SR.unprocessableEntity(undefined, "x").status).toBe(422);
	});

	it("internalServerError devolve 500", () => {
		expect(SR.internalServerError(undefined, "x").status).toBe(500);
	});
});
