import { Module } from "@nestjs/common";
import { MensageriaModule } from "../mensageria/mensageria.module";
import { ExecucaoController } from "./adapters/execucao.controller";
import { CatalogoOsHttpGateway } from "./adapters/gateways/catalogo-os.http.gateway";
import { OrdensExecucaoPrismaGateway } from "./adapters/gateways/ordens-execucao.prisma.gateway";
import { ConsumidorComandosExecucao } from "./adapters/mensageria/consumidor-comandos-execucao";
import { CATALOGO_OS } from "./application/ports/catalogo-os.port";
import { ORDENS_EXECUCAO_GATEWAY } from "./application/ports/ordens-execucao.gateway";
import { ExecutorAcaoOrdem } from "./application/services/executor-acao-ordem";
import { BuscarOrdemUseCase } from "./application/use-cases/buscar-ordem.use-case";
import { CancelarExecucaoUseCase } from "./application/use-cases/cancelar-execucao.use-case";
import { ConcluirReparoUseCase } from "./application/use-cases/concluir-reparo.use-case";
import { ConsultarCatalogoUseCase } from "./application/use-cases/consultar-catalogo.use-case";
import { DeclararReparoInviavelUseCase } from "./application/use-cases/declarar-reparo-inviavel.use-case";
import { EnfileirarOrdemUseCase } from "./application/use-cases/enfileirar-ordem.use-case";
import { ListarFilaUseCase } from "./application/use-cases/listar-fila.use-case";
import { PegarProximaOrdemUseCase } from "./application/use-cases/pegar-proxima-ordem.use-case";
import { RegistrarDiagnosticoUseCase } from "./application/use-cases/registrar-diagnostico.use-case";
import { RejeitarDiagnosticoUseCase } from "./application/use-cases/rejeitar-diagnostico.use-case";

@Module({
	imports: [MensageriaModule],
	controllers: [ExecucaoController],
	providers: [
		EnfileirarOrdemUseCase,
		CancelarExecucaoUseCase,
		ConsumidorComandosExecucao,
		ExecutorAcaoOrdem,
		ListarFilaUseCase,
		PegarProximaOrdemUseCase,
		BuscarOrdemUseCase,
		RegistrarDiagnosticoUseCase,
		RejeitarDiagnosticoUseCase,
		ConcluirReparoUseCase,
		DeclararReparoInviavelUseCase,
		ConsultarCatalogoUseCase,
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
