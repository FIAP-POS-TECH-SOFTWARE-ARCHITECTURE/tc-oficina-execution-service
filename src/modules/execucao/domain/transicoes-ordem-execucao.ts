import { EtapaExecucao, STATUS_ATIVOS, StatusOrdemExecucao } from "./ordem-execucao";

export type AcaoOrdemExecucao =
	"PEGAR" | "CONCLUIR_DIAGNOSTICO" | "REJEITAR_DIAGNOSTICO" | "CONCLUIR_REPARO" | "DECLARAR_INVIAVEL" | "CANCELAR";

const REGRAS: Record<
	AcaoOrdemExecucao,
	{ etapas: readonly EtapaExecucao[]; de: readonly StatusOrdemExecucao[]; para: StatusOrdemExecucao }
> = {
	PEGAR: { etapas: ["DIAGNOSTICO", "REPARO"], de: ["PENDENTE"], para: "EM_ANDAMENTO" },
	CONCLUIR_DIAGNOSTICO: { etapas: ["DIAGNOSTICO"], de: ["EM_ANDAMENTO"], para: "CONCLUIDA" },
	REJEITAR_DIAGNOSTICO: { etapas: ["DIAGNOSTICO"], de: ["EM_ANDAMENTO"], para: "REJEITADA" },
	CONCLUIR_REPARO: { etapas: ["REPARO"], de: ["EM_ANDAMENTO"], para: "CONCLUIDA" },
	DECLARAR_INVIAVEL: { etapas: ["REPARO"], de: ["EM_ANDAMENTO"], para: "INVIAVEL" },
	CANCELAR: { etapas: ["DIAGNOSTICO", "REPARO"], de: STATUS_ATIVOS, para: "CANCELADA" },
};

export function destinoDaTransicao(
	etapa: EtapaExecucao,
	status: StatusOrdemExecucao,
	acao: AcaoOrdemExecucao,
): StatusOrdemExecucao | null {
	const regra = REGRAS[acao];
	return regra.etapas.includes(etapa) && regra.de.includes(status) ? regra.para : null;
}

export function statusDeOrigem(acao: AcaoOrdemExecucao): readonly StatusOrdemExecucao[] {
	return REGRAS[acao].de;
}

export function estaAtiva(status: StatusOrdemExecucao): boolean {
	return STATUS_ATIVOS.includes(status);
}
