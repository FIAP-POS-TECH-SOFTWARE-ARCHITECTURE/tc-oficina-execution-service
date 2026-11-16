import { Inject, Injectable, Logger } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import type { EnvelopeMensagem } from "../../../mensageria/envelope";
import { FluxoCanceladoError } from "../../domain/erros-execucao";
import type { EtapaExecucao } from "../../domain/ordem-execucao";
import { criarEventoExecucao } from "../eventos-execucao";
import type { IniciarReparoPayload, SolicitarDiagnosticoPayload } from "../mensagens-execucao";
import { NovaOrdemExecucao, ORDENS_EXECUCAO_GATEWAY, type OrdensExecucaoGatewayPort } from "../ports/ordens-execucao.gateway";

type DadosOrdem = Pick<NovaOrdemExecucao, "cliente" | "veiculo" | "observacoesAtendimento" | "itens">;

@Injectable()
export class EnfileirarOrdemUseCase {
	private readonly logger = new Logger(EnfileirarOrdemUseCase.name);

	constructor(@Inject(ORDENS_EXECUCAO_GATEWAY) private readonly gateway: OrdensExecucaoGatewayPort) {}

	diagnostico(e: EnvelopeMensagem<SolicitarDiagnosticoPayload>): Promise<void> {
		return this.enfileirar(e, "DIAGNOSTICO", () =>
			Promise.resolve({
				cliente: e.payload.cliente,
				veiculo: e.payload.veiculo,
				observacoesAtendimento: e.payload.observacoesAtendimento,
				itens: [],
			}),
		);
	}

	reparo(e: EnvelopeMensagem<IniciarReparoPayload>): Promise<void> {
		return this.enfileirar(e, "REPARO", async () => {
			const diagnostico = await this.gateway.buscarPorOsEEtapa(e.osId, "DIAGNOSTICO");
			return {
				cliente: diagnostico?.cliente ?? null,
				veiculo: diagnostico?.veiculo ?? null,
				observacoesAtendimento: diagnostico?.observacoesAtendimento ?? null,
				itens: [
					...e.payload.itensServico.map((s) => ({
						tipo: "SERVICO" as const,
						referenciaId: s.servicoId,
						itemOsId: s.itemId,
						nome: s.nome,
						quantidade: s.quantidade,
						tempoEstimadoMin: s.tempoEstimadoMin,
						status: "PENDENTE" as const,
					})),
					...e.payload.itensInsumo.map((i) => ({
						tipo: "INSUMO" as const,
						referenciaId: i.insumoId,
						itemOsId: null,
						nome: i.nome,
						quantidade: i.quantidade,
						tempoEstimadoMin: null,
						status: null,
					})),
				],
			};
		});
	}

	private async enfileirar(e: EnvelopeMensagem<unknown>, etapa: EtapaExecucao, montar: () => Promise<DadosOrdem>): Promise<void> {
		const mensagem = { messageId: e.messageId, tipo: e.tipo };
		const cancelado = await this.gateway.buscarFluxoCancelado(e.fluxoId);
		if (cancelado) return this.reemitirCancelada(e, cancelado.motivo);

		const existente = await this.gateway.buscarPorOsEEtapa(e.osId, etapa);
		if (existente) {
			this.logger.log({ event: "execucao.ordem.reemitida", ordemExecucaoId: existente.id, etapa });
			const evento = criarEventoExecucao(e, "ExecucaoEnfileirada", { etapa, ordemExecucaoId: existente.id }, e.correlationId);
			return this.gateway.registrarSemEfeito({ eventos: [evento], mensagem });
		}

		const id = randomUUID();
		const evento = criarEventoExecucao(e, "ExecucaoEnfileirada", { etapa, ordemExecucaoId: id }, e.correlationId);
		try {
			const ordem = { id, osId: e.osId, fluxoId: e.fluxoId, numeroOs: e.numeroOs, etapa, ...(await montar()) };
			await this.gateway.criarOrdem({ ordem, eventos: [evento], mensagem });
			this.logger.log({ event: "execucao.ordem.enfileirada", ordemExecucaoId: id, etapa });
		} catch (erro) {
			if (!(erro instanceof FluxoCanceladoError)) throw erro;
			await this.reemitirCancelada(e, erro.motivo);
		}
	}

	private async reemitirCancelada(e: EnvelopeMensagem<unknown>, motivo: string): Promise<void> {
		this.logger.log({ event: "execucao.comando_de_fluxo_cancelado" });
		const evento = criarEventoExecucao(e, "ExecucaoCancelada", { etapa: null, motivo }, e.correlationId);
		await this.gateway.registrarSemEfeito({ eventos: [evento], mensagem: { messageId: e.messageId, tipo: e.tipo } });
	}
}
