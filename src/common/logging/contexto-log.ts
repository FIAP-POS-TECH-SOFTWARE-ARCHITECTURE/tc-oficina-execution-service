import { PinoLogger } from "nestjs-pino";
import { storage, Store } from "nestjs-pino/storage";
import type { Logger as LoggerPino } from "pino";

export interface CamposContextoLog {
	fluxoId?: string;
	osId?: string;
	messageId?: string;
	tipo?: string;
}

/**
 * Executa `fn` com um logger filho que carrega os campos de correlação da mensagem.
 * Fora de requisição HTTP não existe o store do pino-http; este é o equivalente para consumidores e jobs.
 */
export function executarComContextoLog<T>(
	campos: CamposContextoLog,
	fn: () => Promise<T>,
	base: LoggerPino | undefined = storage.getStore()?.logger ?? PinoLogger.root,
): Promise<T> {
	if (!base) return fn();
	return storage.run(new Store(base.child(campos)), fn);
}
