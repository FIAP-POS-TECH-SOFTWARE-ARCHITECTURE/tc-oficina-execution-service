import { ExecutionContext } from "@nestjs/common";
import { Role } from "../enums/role.enum";
import { AuthenticatedUser, CurrentUser } from "./current-user.decorator";

const ROUTE_ARGS_METADATA = "__routeArguments__";

function extractFactory(): (data: unknown, ctx: ExecutionContext) => AuthenticatedUser | undefined {
	class FakeCtrl {
		handle(@CurrentUser() _: unknown) {
			return _;
		}
	}
	const meta = Reflect.getMetadata(ROUTE_ARGS_METADATA, FakeCtrl, "handle") as Record<string, any>;
	const entry = Object.values(meta).find((e: any) => e.factory);
	return entry.factory;
}

describe("CurrentUser()", () => {
	it("é uma função decorator chamável", () => {
		expect(typeof CurrentUser).toBe("function");
		const decorator = CurrentUser();
		expect(typeof decorator).toBe("function");
	});

	it("retorna req.user quando presente", () => {
		const factory = extractFactory();
		const user: AuthenticatedUser = { id: "u1", email: "a@a.com", role: Role.ATENDENTE };
		const ctx = {
			switchToHttp: () => ({ getRequest: () => ({ user }) }),
		} as unknown as ExecutionContext;
		expect(factory(undefined, ctx)).toBe(user);
	});

	it("retorna undefined quando req.user ausente", () => {
		const factory = extractFactory();
		const ctx = {
			switchToHttp: () => ({ getRequest: () => ({}) }),
		} as unknown as ExecutionContext;
		expect(factory(undefined, ctx)).toBeUndefined();
	});
});
