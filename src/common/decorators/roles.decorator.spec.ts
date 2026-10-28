import { Role } from "../enums/role.enum";
import { Roles, ROLES_KEY } from "./roles.decorator";

describe("Roles()", () => {
	it("define metadata com array de roles", () => {
		class Dummy {}
		Roles(Role.ADMINISTRADOR, Role.ATENDENTE)(Dummy);
		expect(Reflect.getMetadata(ROLES_KEY, Dummy)).toEqual([Role.ADMINISTRADOR, Role.ATENDENTE]);
	});

	it("aceita lista vazia", () => {
		class Dummy {}
		Roles()(Dummy);
		expect(Reflect.getMetadata(ROLES_KEY, Dummy)).toEqual([]);
	});

	it("expõe ROLES_KEY como 'roles'", () => {
		expect(ROLES_KEY).toBe("roles");
	});
});
