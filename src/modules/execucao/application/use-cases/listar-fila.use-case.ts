import { Inject, Injectable } from "@nestjs/common";
import type { IServiceResponse } from "semantic-response";
import { SR } from "../../../../common/utils/service-response.util";
import type { EtapaExecucao } from "../../domain/ordem-execucao";
import { ORDENS_EXECUCAO_GATEWAY, type OrdensExecucaoGatewayPort } from "../ports/ordens-execucao.gateway";

@Injectable()
export class ListarFilaUseCase {
	constructor(@Inject(ORDENS_EXECUCAO_GATEWAY) private readonly gateway: OrdensExecucaoGatewayPort) {}

	async execute(etapa: EtapaExecucao): Promise<IServiceResponse<unknown>> {
		return SR.ok(await this.gateway.listarFila(etapa));
	}
}
