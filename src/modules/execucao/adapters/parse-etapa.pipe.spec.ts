import { BadRequestException } from "@nestjs/common";
import { ParseEtapaPipe } from "./parse-etapa.pipe";

describe("ParseEtapaPipe", () => {
	const pipe = new ParseEtapaPipe();
	it.each([
		["DIAGNOSTICO", "DIAGNOSTICO"],
		["reparo", "REPARO"],
	])("%s → %s", (entrada, saida) => expect(pipe.transform(entrada)).toBe(saida));
	it.each(["ENTREGA", "", undefined])("rejeita %p", (entrada) => {
		expect(() => pipe.transform(entrada as string)).toThrow(new BadRequestException("etapa deve ser DIAGNOSTICO ou REPARO"));
	});
});
