import { readFileSync } from "node:fs";
import { join } from "node:path";
import { montarAtributos } from "../../mensageria/atributos-mensagem";
import { ValidadorContratos } from "../../mensageria/validador-contratos";
import { criarEventoExecucao } from "./eventos-execucao";

const ref = {
	fluxoId: "3f2a1c9e-8b7d-4e6f-a5b4-c3d2e1f0a9b8",
	osId: "9c8b7a6d-5e4f-4a3b-8c2d-1e0f9a8b7c6d",
	numeroOs: "OS-2026-000123",
};

describe("criarEventoExecucao", () => {
	it("gera evento válido pelo contrato com origem execution (filtro da assinatura do orquestrador)", () => {
		const evento = criarEventoExecucao(
			ref,
			"ExecucaoEnfileirada",
			{ etapa: "DIAGNOSTICO", ordemExecucaoId: "7a8b9c0d-1e2f-4a3b-9c4d-5e6f7a8b9c0d" },
			"req-1",
		);
		expect(evento).toMatchObject({ ...ref, tipo: "ExecucaoEnfileirada", origem: "execution", correlationId: "req-1", versao: 1 });
		expect(montarAtributos(evento).origem.StringValue).toBe("execution");
		expect(new ValidadorContratos().validar(evento).valido).toBe(true);
	});

	it("ExecucaoCancelada com etapa null é válida", () => {
		expect(
			new ValidadorContratos().validar(criarEventoExecucao(ref, "ExecucaoCancelada", { etapa: null, motivo: "OS cancelada" }, "c"))
				.valido,
		).toBe(true);
	});

	it("tipos de evento batem com tipos.json do contrato", () => {
		const tipos = JSON.parse(readFileSync(join(process.cwd(), "contratos", "tipos.json"), "utf8"));
		expect(tipos.eventos.execution).toEqual([
			"ExecucaoEnfileirada",
			"DiagnosticoIniciado",
			"DiagnosticoConcluido",
			"DiagnosticoRejeitado",
			"ReparoIniciado",
			"ReparoConcluido",
			"ReparoInviavel",
			"ExecucaoCancelada",
		]);
	});
});
