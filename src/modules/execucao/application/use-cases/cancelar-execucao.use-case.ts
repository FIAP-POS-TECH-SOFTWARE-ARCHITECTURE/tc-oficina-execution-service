import { Inject, Injectable, Logger } from "@nestjs/common";
import type { EnvelopeMensagem } from "../../../mensageria/envelope";
import { STATUS_ATIVOS } from "../../domain/ordem-execucao";
import { estaAtiva } from "../../domain/transicoes-ordem-execucao";
import { criarEventoExecucao } from "../eventos-execucao";
import type { CancelarExecucaoPayload } from "../mensagens-execucao";
import { ORDENS_EXECUCAO_GATEWAY, type OrdensExecucaoGatewayPort } from "../ports/ordens-execucao.gateway";

@Injectable()
export class CancelarExecucaoUseCase {
	private readonly logger = new Logger(CancelarExecucaoUseCase.name);

	constructor(@Inject(ORDENS_EXECUCAO_GATEWAY) private readonly gateway: OrdensExecucaoGatewayPort) {}

	async execute(e: EnvelopeMensagem<CancelarExecucaoPayload>): Promise<void> {
		const { motivo } = e.payload;
		const mensagem = { messageId: e.messageId, tipo: e.tipo };
		const fluxo = { fluxoId: e.fluxoId, osId: e.osId, motivo };
		const ordens = await this.gateway.listarPorOs(e.osId);

		const ativa = ordens.find((o) => estaAtiva(o.status));
		if (ativa) {
			await this.gateway.transicionar({
				ordemId: ativa.id,
				de: STATUS_ATIVOS,
				para: "CANCELADA",
				usuarioId: null,
				observacao: `Cancelada pelo fluxo da OS: ${motivo}`,
				dados: { motivo, finalizadaEm: new Date() },
				registrarFluxoCancelado: fluxo,
				mensagem,
				eventos: [criarEventoExecucao(e, "ExecucaoCancelada", { etapa: ativa.etapa, motivo }, e.correlationId)],
			});
			this.logger.log({ event: "execucao.ordem.cancelada", ordemExecucaoId: ativa.id, etapa: ativa.etapa });
			return;
		}

		const cancelada = ordens.find((o) => o.status === "CANCELADA");
		const payload = { etapa: cancelada?.etapa ?? null, motivo: cancelada?.motivo ?? motivo };
		await this.gateway.registrarCancelamentoDoFluxo({
			...fluxo,
			mensagem,
			eventos: [criarEventoExecucao(e, "ExecucaoCancelada", payload, e.correlationId)],
		});
		this.logger.log({ event: "execucao.fluxo.cancelado_sem_ordem_ativa", etapa: payload.etapa });
	}
}
