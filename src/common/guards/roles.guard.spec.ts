import { ExecutionContext, ForbiddenException } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { Role } from "../enums/role.enum";
import { RolesGuard } from "./roles.guard";

const ctxFor = (req: any): ExecutionContext =>
	({
		getHandler: () => undefined,
		getClass: () => undefined,
		switchToHttp: () => ({ getRequest: () => req }),
	}) as unknown as ExecutionContext;

describe("RolesGuard", () => {
	let reflector: jest.Mocked<Reflector>;
	let guard: RolesGuard;

	beforeEach(() => {
		reflector = { getAllAndOverride: jest.fn() } as unknown as jest.Mocked<Reflector>;
		guard = new RolesGuard(reflector);
	});

	it("permite quando não há roles requeridas", () => {
		reflector.getAllAndOverride.mockReturnValueOnce(undefined);
		expect(guard.canActivate(ctxFor({}))).toBe(true);
	});

	it("permite quando lista de roles está vazia", () => {
		reflector.getAllAndOverride.mockReturnValueOnce([]);
		expect(guard.canActivate(ctxFor({}))).toBe(true);
	});

	it("403 quando user ausente no request", () => {
		reflector.getAllAndOverride.mockReturnValueOnce([Role.ADMINISTRADOR]);
		expect(() => guard.canActivate(ctxFor({}))).toThrow(ForbiddenException);
	});

	it("403 quando role do user não bate com a lista", () => {
		reflector.getAllAndOverride.mockReturnValueOnce([Role.ADMINISTRADOR]);
		expect(() => guard.canActivate(ctxFor({ user: { role: Role.ATENDENTE } }))).toThrow(ForbiddenException);
	});

	it("permite quando role do user está na lista requerida", () => {
		reflector.getAllAndOverride.mockReturnValueOnce([Role.ADMINISTRADOR, Role.ATENDENTE]);
		expect(guard.canActivate(ctxFor({ user: { role: Role.ATENDENTE } }))).toBe(true);
	});
});
