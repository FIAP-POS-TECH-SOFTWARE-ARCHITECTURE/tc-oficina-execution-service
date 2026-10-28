import type { EnvelopeMensagem } from "../../../mensageria/envelope";
import type {
	ClienteSnapshot,
	EtapaExecucao,
	OrdemExecucao,
	StatusItemExecucao,
	StatusOrdemExecucao,
	TipoItemExecucao,
	VeiculoSnapshot,
} from "../../domain/ordem-execucao";

export const ORDENS_EXECUCAO_GATEWAY = Symbol("ORDENS_EXECUCAO_GATEWAY");

/** O `messageId` já foi registrado em `mensagens_processadas`: a mensagem é duplicata e pode ser apagada. */
export class MensagemJaProcessadaError extends Error {
	constructor(readonly messageId: string) {
		super(`Mensagem ${messageId} já processada`);
		this.name = "MensagemJaProcessadaError";
	}
}

export interface MensagemRecebida {
	messageId: string;
	tipo: string;
}

export interface NovoItemExecucao {
	tipo: TipoItemExecucao;
	referenciaId: string;
	itemOsId: string | null;
	nome: string;
	quantidade: number;
	tempoEstimadoMin: number | null;
	status: StatusItemExecucao | null;
}

export interface NovaOrdemExecucao {
	id: string;
	osId: string;
	fluxoId: string;
	numeroOs: string;
	etapa: EtapaExecucao;
	cliente: ClienteSnapshot | null;
	veiculo: VeiculoSnapshot | null;
	observacoesAtendimento: string | null;
	itens: NovoItemExecucao[];
}

export interface CancelamentoFluxo {
	fluxoId: string;
	osId: string;
	motivo: string;
}

export interface DadosTransicao {
	mecanicoId?: string;
	diagnostico?: string;
	motivo?: string;
	iniciadaEm?: Date;
	finalizadaEm?: Date;
}

export interface TransicaoOrdemExecucao {
	ordemId: string;
	de: readonly StatusOrdemExecucao[];
	para: StatusOrdemExecucao;
	usuarioId: string | null;
	observacao: string | null;
	dados?: DadosTransicao;
	itensNovos?: NovoItemExecucao[];
	concluirItensServicoEm?: Date;
	registrarFluxoCancelado?: CancelamentoFluxo;
	eventos: EnvelopeMensagem<unknown>[];
	mensagem?: MensagemRecebida;
}

export interface HistoricoExecucaoItem {
	id: string;
	statusAnterior: StatusOrdemExecucao | null;
	statusNovo: StatusOrdemExecucao;
	usuarioId: string | null;
	observacao: string | null;
	messageId: string | null;
	createdAt: Date;
}

export interface PegarProximaParams {
	etapa: EtapaExecucao;
	mecanicoId: string;
	agora: Date;
	montarEvento: (ordem: OrdemExecucao) => EnvelopeMensagem<unknown>;
}

export interface AtualizacaoItem {
	ordemId: string;
	itemId: string;
	de: StatusItemExecucao;
	para: StatusItemExecucao;
	em: Date;
	usuarioId: string;
	observacao: string;
}

export interface OrdensExecucaoGatewayPort {
	buscarPorId(id: string): Promise<OrdemExecucao | null>;
	buscarPorOsEEtapa(osId: string, etapa: EtapaExecucao): Promise<OrdemExecucao | null>;
	/** Mais recente primeiro. */
	listarPorOs(osId: string): Promise<OrdemExecucao[]>;
	buscarFluxoCancelado(fluxoId: string): Promise<{ motivo: string } | null>;
	/** Lança `FluxoCanceladoError` se o fluxo já foi cancelado. */
	criarOrdem(d: {
		ordem: NovaOrdemExecucao;
		eventos: EnvelopeMensagem<unknown>[];
		mensagem: MensagemRecebida;
	}): Promise<OrdemExecucao>;
	registrarSemEfeito(d: { eventos: EnvelopeMensagem<unknown>[]; mensagem: MensagemRecebida }): Promise<void>;
	/** Lança `TransicaoConcorrenteError` se houver ordem ativa da OS. */
	registrarCancelamentoDoFluxo(
		d: CancelamentoFluxo & { eventos: EnvelopeMensagem<unknown>[]; mensagem: MensagemRecebida },
	): Promise<void>;
	/** Lança `TransicaoConcorrenteError` se o status travado não estiver em `de`. */
	transicionar(t: TransicaoOrdemExecucao): Promise<OrdemExecucao>;
	/** Pendentes da etapa por ordem de chegada. */
	listarFila(etapa: EtapaExecucao): Promise<OrdemExecucao[]>;
	/** `null` = fila vazia (ou todas travadas por outras transações). */
	pegarProxima(p: PegarProximaParams): Promise<OrdemExecucao | null>;
	/** Mais antigo primeiro. */
	listarHistorico(ordemId: string): Promise<HistoricoExecucaoItem[]>;
	/** Lança `TransicaoConcorrenteError` se a ordem não estiver `EM_ANDAMENTO` ou o item não estiver em `de`. */
	atualizarItem(p: AtualizacaoItem): Promise<OrdemExecucao>;
}
