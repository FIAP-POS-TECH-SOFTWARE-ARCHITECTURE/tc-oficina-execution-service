import { Module } from "@nestjs/common";
import { MensageriaModule } from "../mensageria/mensageria.module";
import { CatalogoOsHttpGateway } from "./adapters/gateways/catalogo-os.http.gateway";
import { OrdensExecucaoPrismaGateway } from "./adapters/gateways/ordens-execucao.prisma.gateway";
import { ConsumidorComandosExecucao } from "./adapters/mensageria/consumidor-comandos-execucao";
import { CATALOGO_OS } from "./application/ports/catalogo-os.port";
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
		{
			provide: CATALOGO_OS,
			useFactory: () =>
				new CatalogoOsHttpGateway({ baseUrl: process.env.OS_SERVICE_URL ?? "", apiKey: process.env.INTERNAL_API_KEY ?? "" }),
		},
	],
	exports: [ORDENS_EXECUCAO_GATEWAY, CATALOGO_OS],
})
export class ExecucaoModule {}
