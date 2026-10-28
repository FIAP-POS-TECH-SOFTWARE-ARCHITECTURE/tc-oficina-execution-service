import { FluxoCanceladoError, TransicaoConcorrenteError } from "./erros-execucao";
import { destinoDaTransicao, estaAtiva, statusDeOrigem } from "./transicoes-ordem-execucao";

describe("transições da ordem de execução", () => {
	it.each([
		["DIAGNOSTICO", "PENDENTE", "PEGAR", "EM_ANDAMENTO"],
		["REPARO", "PENDENTE", "PEGAR", "EM_ANDAMENTO"],
		["DIAGNOSTICO", "EM_ANDAMENTO", "CONCLUIR_DIAGNOSTICO", "CONCLUIDA"],
		["DIAGNOSTICO", "EM_ANDAMENTO", "REJEITAR_DIAGNOSTICO", "REJEITADA"],
		["REPARO", "EM_ANDAMENTO", "CONCLUIR_REPARO", "CONCLUIDA"],
		["REPARO", "EM_ANDAMENTO", "DECLARAR_INVIAVEL", "INVIAVEL"],
		["DIAGNOSTICO", "PENDENTE", "CANCELAR", "CANCELADA"],
		["REPARO", "EM_ANDAMENTO", "CANCELAR", "CANCELADA"],
	] as const)("%s %s --%s--> %s", (etapa, status, acao, esperado) => {
		expect(destinoDaTransicao(etapa, status, acao)).toBe(esperado);
	});

	it.each([
		["REPARO", "EM_ANDAMENTO", "CONCLUIR_DIAGNOSTICO"],
		["DIAGNOSTICO", "EM_ANDAMENTO", "CONCLUIR_REPARO"],
		["DIAGNOSTICO", "EM_ANDAMENTO", "DECLARAR_INVIAVEL"],
		["REPARO", "PENDENTE", "CONCLUIR_REPARO"],
		["DIAGNOSTICO", "EM_ANDAMENTO", "PEGAR"],
		["DIAGNOSTICO", "CANCELADA", "CONCLUIR_DIAGNOSTICO"],
		["REPARO", "CANCELADA", "PEGAR"],
		["REPARO", "CONCLUIDA", "CANCELAR"],
	] as const)("%s %s --%s--> inválida", (etapa, status, acao) => {
		expect(destinoDaTransicao(etapa, status, acao)).toBeNull();
	});

	it("origens e atividade", () => {
		expect(statusDeOrigem("CANCELAR")).toEqual(["PENDENTE", "EM_ANDAMENTO"]);
		expect(statusDeOrigem("PEGAR")).toEqual(["PENDENTE"]);
		expect(estaAtiva("EM_ANDAMENTO")).toBe(true);
		expect(estaAtiva("CANCELADA")).toBe(false);
	});

	it("erros de domínio", () => {
		expect(new TransicaoConcorrenteError("o-1").message).toBe(
			"A ordem o-1 mudou de estado durante a operação; consulte a ordem e tente novamente",
		);
		expect(new FluxoCanceladoError("f-1", "PRAZO_EXPIRADO")).toMatchObject({
			fluxoId: "f-1",
			motivo: "PRAZO_EXPIRADO",
			name: "FluxoCanceladoError",
		});
	});
});
