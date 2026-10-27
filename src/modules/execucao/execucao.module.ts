import { Module } from "@nestjs/common";
import { MensageriaModule } from "../mensageria/mensageria.module";
import { OrdensExecucaoPrismaGateway } from "./adapters/gateways/ordens-execucao.prisma.gateway";
import { ConsumidorComandosExecucao } from "./adapters/mensageria/consumidor-comandos-execucao";
import { ORDENS_EXECUCAO_GATEWAY } from "./application/ports/ordens-execucao.gateway";
import { CancelarExecucaoUseCase } from "./application/use-cases/cancelar-execucao.use-case";
import { EnfileirarOrdemUseCase } from "./application/use-cases/enfileirar-ordem.use-case";

@Module({
	imports: [MensageriaModule],
	providers: [
		EnfileirarOrdemUseCase,
		CancelarExecucaoUseCase,
		ConsumidorComandosExecucao,
		{ provide: ORDENS_EXECUCAO_GATEWAY, useClass: OrdensExecucaoPrismaGateway },
	],
	exports: [ORDENS_EXECUCAO_GATEWAY],
})
export class ExecucaoModule {}
