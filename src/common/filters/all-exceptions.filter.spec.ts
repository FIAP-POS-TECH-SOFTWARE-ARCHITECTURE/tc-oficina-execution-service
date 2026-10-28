import { ArgumentsHost, HttpException } from "@nestjs/common";
import { AllExceptionsFilter } from "./all-exceptions.filter";

const buildHost = () => {
	const json = jest.fn();
	const status = jest.fn().mockReturnValue({ json });
	const res = { status };
	const host = {
		switchToHttp: () => ({
			getResponse: () => res,
		}),
	} as unknown as ArgumentsHost;
	return { host, status, json };
};

describe("AllExceptionsFilter", () => {
	let filter: AllExceptionsFilter;

	beforeEach(() => {
		filter = new AllExceptionsFilter();
	});

	it("trata HttpException com mensagem string", () => {
		const { host, status, json } = buildHost();
		const ex = new HttpException("Erro X", 400);
		filter.catch(ex, host);
		expect(status).toHaveBeenCalledWith(400);
		expect(json).toHaveBeenCalledWith(expect.objectContaining({ status: 400, success: false, message: "Erro X" }));
	});

	it("junta mensagens em array com '; '", () => {
		const { host, status, json } = buildHost();
		const ex = new HttpException({ message: ["a", "b"] }, 422);
		filter.catch(ex, host);
		expect(status).toHaveBeenCalledWith(422);
		expect(json).toHaveBeenCalledWith(expect.objectContaining({ status: 422, message: "a; b" }));
	});

	it("exceção desconhecida vira 500 e loga stack", () => {
		const { host, status, json } = buildHost();
		const loggerSpy = jest.spyOn((filter as any).logger, "error").mockImplementation(() => undefined);
		filter.catch(new Error("boom"), host);
		expect(status).toHaveBeenCalledWith(500);
		expect(json).toHaveBeenCalledWith(expect.objectContaining({ status: 500, success: false }));
		expect(loggerSpy).toHaveBeenCalled();
	});

	it("exceção não-Error desconhecida cai no else", () => {
		const { host, status } = buildHost();
		const loggerSpy = jest.spyOn((filter as any).logger, "error").mockImplementation(() => undefined);
		filter.catch("string-erro", host);
		expect(status).toHaveBeenCalledWith(500);
		expect(loggerSpy).toHaveBeenCalledWith("string-erro");
	});

	it("HttpException com objeto contendo message string retorna a message do objeto", () => {
		const { host, status, json } = buildHost();
		const ex = new HttpException({ message: "Erro detalhado" }, 400);
		filter.catch(ex, host);
		expect(status).toHaveBeenCalledWith(400);
		expect(json).toHaveBeenCalledWith(expect.objectContaining({ message: "Erro detalhado" }));
	});

	it("HttpException com payload objeto sem message usa message da própria exception", () => {
		const { host, status, json } = buildHost();
		const ex = new HttpException({ foo: "bar" }, 418);
		filter.catch(ex, host);
		expect(status).toHaveBeenCalledWith(418);
		expect(json).toHaveBeenCalled();
	});

	it("HttpException com message de tipo não-string e não-array usa fallback", () => {
		const { host, status, json } = buildHost();
		const ex = new HttpException({ message: 42 }, 422);
		filter.catch(ex, host);
		expect(status).toHaveBeenCalledWith(422);
		expect(json).toHaveBeenCalledWith(expect.objectContaining({ success: false }));
	});

	it("HttpException com response primitivo (não-objeto) usa fallback da exception", () => {
		const { host, status } = buildHost();

		const ex = new HttpException(42 as any, 400);
		filter.catch(ex, host);
		expect(status).toHaveBeenCalledWith(400);
	});
});
