import { CallHandler, ExecutionContext } from "@nestjs/common";
import { firstValueFrom, of } from "rxjs";
import { ResponseInterceptor } from "./response.interceptor";

const ctxFor = (status: jest.Mock) =>
	({
		switchToHttp: () => ({ getResponse: () => ({ status }) }),
	}) as unknown as ExecutionContext;

const handler = (value: unknown): CallHandler => ({ handle: () => of(value) });

describe("ResponseInterceptor", () => {
	let interceptor: ResponseInterceptor<unknown>;

	beforeEach(() => {
		interceptor = new ResponseInterceptor();
	});

	it("preserva payload já no formato IServiceResponse e seta status", async () => {
		const status = jest.fn();
		const semantic = { status: 201, success: true, data: { x: 1 } };
		const out: any = await firstValueFrom(interceptor.intercept(ctxFor(status), handler(semantic)));
		expect(status).toHaveBeenCalledWith(201);
		expect(out).toEqual(semantic);
	});

	it("envelopa payload cru em {status:200, success:true, data}", async () => {
		const status = jest.fn();
		const out: any = await firstValueFrom(interceptor.intercept(ctxFor(status), handler({ foo: "bar" })));
		expect(status).toHaveBeenCalledWith(200);
		expect(out).toEqual({ status: 200, success: true, data: { foo: "bar" } });
	});

	it("valor primitivo é envelopado", async () => {
		const status = jest.fn();
		const out: any = await firstValueFrom(interceptor.intercept(ctxFor(status), handler("API Online!")));
		expect(status).toHaveBeenCalledWith(200);
		expect(out.data).toBe("API Online!");
	});

	it("valor null é envelopado", async () => {
		const status = jest.fn();
		const out: any = await firstValueFrom(interceptor.intercept(ctxFor(status), handler(null)));
		expect(status).toHaveBeenCalledWith(200);
		expect(out.data).toBe(null);
	});
});
