import { mensagemDeErro } from "./erro.util";

describe("mensagemDeErro", () => {
	it("usa a mensagem de Error", () => expect(mensagemDeErro(new Error("falhou"))).toBe("falhou"));
	it("converte valores não-Error em string", () => expect(mensagemDeErro(42)).toBe("42"));
});
