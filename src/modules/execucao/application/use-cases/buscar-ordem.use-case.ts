import { Inject, Injectable } from "@nestjs/common";
import type { IServiceResponse } from "semantic-response";
import { SR } from "../../../../common/utils/service-response.util";
import { ORDENS_EXECUCAO_GATEWAY, type OrdensExecucaoGatewayPort } from "../ports/ordens-execucao.gateway";

@Injectable()
export class BuscarOrdemUseCase {
	constructor(@Inject(ORDENS_EXECUCAO_GATEWAY) private readonly gateway: OrdensExecucaoGatewayPort) {}

	async execute(ordemId: string): Promise<IServiceResponse<unknown>> {
		const ordem = await this.gateway.buscarPorId(ordemId);
		if (!ordem) return SR.notFound(undefined, "Ordem de execução não encontrada");
		return SR.ok({ ...ordem, historico: await this.gateway.listarHistorico(ordemId) });
	}
}
