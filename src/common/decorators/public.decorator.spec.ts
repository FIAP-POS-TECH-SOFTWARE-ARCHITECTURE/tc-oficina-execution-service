import { IS_PUBLIC_KEY, Public } from "./public.decorator";

describe("Public()", () => {
	it("define metadata isPublic=true na classe/método", () => {
		class Dummy {}
		Public()(Dummy);
		expect(Reflect.getMetadata(IS_PUBLIC_KEY, Dummy)).toBe(true);
	});

	it("expõe a chave IS_PUBLIC_KEY como string 'isPublic'", () => {
		expect(IS_PUBLIC_KEY).toBe("isPublic");
	});
});
