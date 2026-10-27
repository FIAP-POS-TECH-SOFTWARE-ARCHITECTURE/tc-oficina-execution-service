import { UnauthorizedException } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { JwtService } from "@nestjs/jwt";
import { IS_CLIENTE_AUTH_KEY } from "../decorators/cliente-auth.decorator";
import { IS_PUBLIC_KEY } from "../decorators/public.decorator";
import { JwtAuthGuard } from "./jwt-auth.guard";

const SEGREDO = "segredo-guard";

describe("JwtAuthGuard (validação local por assinatura)", () => {
	const jwt = new JwtService({ secret: SEGREDO });
	const reflector = { getAllAndOverride: jest.fn() };
	const guard = new JwtAuthGuard(jwt, reflector as unknown as Reflector);

	const contexto = (authorization: string | undefined, metadados: Record<string, boolean> = {}) => {
		reflector.getAllAndOverride.mockImplementation((chave: string) => metadados[chave] ?? false);
		const req: Record<string, unknown> = { headers: authorization ? { authorization } : {} };
		return {
			ctx: { getHandler: () => ({}), getClass: () => ({}), switchToHttp: () => ({ getRequest: () => req }) } as never,
			req,
		};
	};

	beforeEach(() => {
		process.env.JWT_SECRET = SEGREDO;
	});

	it("libera rota @Public sem token", async () => {
		await expect(guard.canActivate(contexto(undefined, { [IS_PUBLIC_KEY]: true }).ctx)).resolves.toBe(true);
	});

	it.each([
		["sem header", undefined],
		["esquema diferente de Bearer", "Basic abc"],
		["token assinado com outro segredo", `Bearer ${new JwtService({ secret: "outro" }).sign({ sub: "u1", role: "ADMINISTRADOR" })}`],
		["token malformado", "Bearer abc.def"],
	])("401 %s", async (_caso, authorization) => {
		await expect(guard.canActivate(contexto(authorization).ctx)).rejects.toBeInstanceOf(UnauthorizedException);
	});

	it("401 para token sem sub", async () => {
		const token = await jwt.signAsync({ role: "ADMINISTRADOR" });
		await expect(guard.canActivate(contexto(`Bearer ${token}`).ctx)).rejects.toThrow("sub");
	});

	it("aceita token de cliente em rota @ClienteAuth e popula req.cliente", async () => {
		const token = await jwt.signAsync({ sub: "c1", nome: "Maria", cpf: "52998224725", type: "cliente" });
		const { ctx, req } = contexto(`Bearer ${token}`, { [IS_CLIENTE_AUTH_KEY]: true });
		await expect(guard.canActivate(ctx)).resolves.toBe(true);
		expect(req.cliente).toEqual({ id: "c1", nome: "Maria", cpf: "52998224725" });
	});

	it("completa claims opcionais ausentes do cliente com string vazia", async () => {
		const token = await jwt.signAsync({ sub: "c1", type: "cliente" });
		const { ctx, req } = contexto(`Bearer ${token}`, { [IS_CLIENTE_AUTH_KEY]: true });
		await guard.canActivate(ctx);
		expect(req.cliente).toEqual({ id: "c1", nome: "", cpf: "" });
	});

	it("401 para token de cliente em rota de staff", async () => {
		const token = await jwt.signAsync({ sub: "c1", type: "cliente" });
		await expect(guard.canActivate(contexto(`Bearer ${token}`).ctx)).rejects.toThrow("clientes");
	});

	it("401 para token de staff em rota @ClienteAuth", async () => {
		const token = await jwt.signAsync({ sub: "u1", email: "a@b.c", role: "ATENDENTE" });
		await expect(guard.canActivate(contexto(`Bearer ${token}`, { [IS_CLIENTE_AUTH_KEY]: true }).ctx)).rejects.toThrow("CPF");
	});

	it("401 para token de staff sem role válida", async () => {
		const token = await jwt.signAsync({ sub: "u1", role: "GERENTE" });
		await expect(guard.canActivate(contexto(`Bearer ${token}`).ctx)).rejects.toThrow("função");
	});

	it("aceita staff válido e popula req.user", async () => {
		const token = await jwt.signAsync({ sub: "u1", email: "a@b.c", role: "ADMINISTRADOR" });
		const { ctx, req } = contexto(`Bearer ${token}`);
		await expect(guard.canActivate(ctx)).resolves.toBe(true);
		expect(req.user).toEqual({ id: "u1", email: "a@b.c", role: "ADMINISTRADOR" });
	});

	it("staff sem email recebe string vazia", async () => {
		const token = await jwt.signAsync({ sub: "u1", role: "ATENDENTE" });
		const { ctx, req } = contexto(`Bearer ${token}`);
		await guard.canActivate(ctx);
		expect(req.user).toEqual({ id: "u1", email: "", role: "ATENDENTE" });
	});
});
