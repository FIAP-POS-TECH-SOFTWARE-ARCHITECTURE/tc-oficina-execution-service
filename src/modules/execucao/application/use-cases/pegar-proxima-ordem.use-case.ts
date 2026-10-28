import { Inject, Injectable, Logger } from "@nestjs/common";
import type { IServiceResponse } from "semantic-response";
import { SR } from "../../../../common/utils/service-response.util";
import type { EtapaExecucao } from "../../domain/ordem-execucao";
import { criarEventoExecucao } from "../eventos-execucao";
import { ORDENS_EXECUCAO_GATEWAY, type OrdensExecucaoGatewayPort } from "../ports/ordens-execucao.gateway";
import type { UsuarioAcao } from "../services/executor-acao-ordem";

@Injectable()
export class PegarProximaOrdemUseCase {
	private readonly logger = new Logger(PegarProximaOrdemUseCase.name);

	constructor(@Inject(ORDENS_EXECUCAO_GATEWAY) private readonly gateway: OrdensExecucaoGatewayPort) {}

	async execute(etapa: EtapaExecucao, usuario: UsuarioAcao, correlationId: string): Promise<IServiceResponse<unknown>> {
		const tipo = etapa === "DIAGNOSTICO" ? "DiagnosticoIniciado" : "ReparoIniciado";
		let messageId: string | undefined;
		const ordem = await this.gateway.pegarProxima({
			etapa,
			mecanicoId: usuario.id,
			agora: new Date(),
			montarEvento: (o) => {
				const evento = criarEventoExecucao(o, tipo, { mecanicoId: usuario.id }, correlationId);
				messageId = evento.messageId;
				return evento;
			},
		});
		if (!ordem) return SR.notFound(undefined, `Nenhuma ordem pendente na fila de ${etapa}`);
		this.logger.log({
			event: "execucao.ordem.pega",
			fluxoId: ordem.fluxoId,
			osId: ordem.osId,
			ordemExecucaoId: ordem.id,
			messageId,
			etapa,
		});
		return SR.ok(ordem, `Ordem de ${etapa} atribuída a você`);
	}
}
