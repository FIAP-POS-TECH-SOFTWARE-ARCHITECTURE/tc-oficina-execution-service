import { Injectable, Logger, OnApplicationBootstrap, OnApplicationShutdown } from "@nestjs/common";
import { executarComContextoLog } from "../../../../common/logging/contexto-log";
import { urlDaFila, workersHabilitados } from "../../../mensageria/configuracao-mensageria";
import { ConsumidorSqs } from "../../../mensageria/consumidor-sqs";
import type { EnvelopeMensagem } from "../../../mensageria/envelope";
import type { CancelarExecucaoPayload, IniciarReparoPayload, SolicitarDiagnosticoPayload } from "../../application/mensagens-execucao";
import { MensagemJaProcessadaError } from "../../application/ports/ordens-execucao.gateway";
import { CancelarExecucaoUseCase } from "../../application/use-cases/cancelar-execucao.use-case";
import { EnfileirarOrdemUseCase } from "../../application/use-cases/enfileirar-ordem.use-case";

@Injectable()
export class ConsumidorComandosExecucao implements OnApplicationBootstrap, OnApplicationShutdown {
	private readonly logger = new Logger(ConsumidorComandosExecucao.name);

	constructor(
		private readonly consumidor: ConsumidorSqs,
		private readonly enfileirar: EnfileirarOrdemUseCase,
		private readonly cancelar: CancelarExecucaoUseCase,
	) {}

	onApplicationBootstrap(): void {
		if (!workersHabilitados()) return;
		this.consumidor.iniciar(urlDaFila("execucao-comandos"), (e) => this.processar(e), ["os"]);
	}

	async onApplicationShutdown(): Promise<void> {
		await this.consumidor.parar();
	}

	processar(e: EnvelopeMensagem): Promise<void> {
		return executarComContextoLog({ fluxoId: e.fluxoId, osId: e.osId, messageId: e.messageId, tipo: e.tipo }, async () => {
			try {
				await this.despachar(e);
			} catch (erro) {
				if (!(erro instanceof MensagemJaProcessadaError)) throw erro;
				this.logger.log({ event: "mensageria.duplicada" });
			}
		});
	}

	private despachar(e: EnvelopeMensagem): Promise<void> {
		switch (e.tipo) {
			case "SolicitarDiagnostico":
				return this.enfileirar.diagnostico(e as unknown as EnvelopeMensagem<SolicitarDiagnosticoPayload>);
			case "IniciarReparo":
				return this.enfileirar.reparo(e as unknown as EnvelopeMensagem<IniciarReparoPayload>);
			case "CancelarExecucao":
				return this.cancelar.execute(e as unknown as EnvelopeMensagem<CancelarExecucaoPayload>);
			default:
				throw new Error(`Tipo não suportado na fila de comandos do execution: ${e.tipo}`);
		}
	}
}
