export const ETAPAS_EXECUCAO = ["DIAGNOSTICO", "REPARO"] as const;
export type EtapaExecucao = (typeof ETAPAS_EXECUCAO)[number];
export type StatusOrdemExecucao = "PENDENTE" | "EM_ANDAMENTO" | "CONCLUIDA" | "REJEITADA" | "INVIAVEL" | "CANCELADA";
export const STATUS_ATIVOS: readonly StatusOrdemExecucao[] = ["PENDENTE", "EM_ANDAMENTO"];
export type TipoItemExecucao = "SERVICO" | "INSUMO";
export type StatusItemExecucao = "PENDENTE" | "EM_EXECUCAO" | "CONCLUIDO";

export interface ClienteSnapshot {
	id: string;
	nome: string;
}

export interface VeiculoSnapshot {
	id: string;
	placa: string;
	marca: string;
	modelo: string;
	ano: number;
}

export interface ItemExecucao {
	id: string;
	tipo: TipoItemExecucao;
	referenciaId: string;
	itemOsId: string | null;
	nome: string;
	quantidade: number;
	tempoEstimadoMin: number | null;
	status: StatusItemExecucao | null;
	iniciadoEm: Date | null;
	concluidoEm: Date | null;
}

export interface OrdemExecucao {
	id: string;
	osId: string;
	fluxoId: string;
	numeroOs: string;
	etapa: EtapaExecucao;
	status: StatusOrdemExecucao;
	mecanicoId: string | null;
	cliente: ClienteSnapshot | null;
	veiculo: VeiculoSnapshot | null;
	observacoesAtendimento: string | null;
	diagnostico: string | null;
	motivo: string | null;
	iniciadaEm: Date | null;
	finalizadaEm: Date | null;
	createdAt: Date;
	updatedAt: Date;
	itens: ItemExecucao[];
}
