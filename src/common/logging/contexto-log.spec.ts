import { Logger } from "@nestjs/common";
import { Logger as NestPinoLogger, PinoLogger } from "nestjs-pino";
import { __resetOutOfContextForTests } from "nestjs-pino/PinoLogger";
import { Writable } from "node:stream";
import pino from "pino";
import { executarComContextoLog } from "./contexto-log";

describe("executarComContextoLog", () => {
	const registros: Record<string, unknown>[] = [];
	let stream: Writable;

	beforeEach(() => {
		registros.length = 0;
		__resetOutOfContextForTests();
		stream = new Writable({
			write(chunk: Buffer, _enc, cb) {
				registros.push(JSON.parse(chunk.toString()) as Record<string, unknown>);
				cb();
			},
		});
		Logger.overrideLogger(new NestPinoLogger(new PinoLogger({ pinoHttp: { level: "info", stream } }), {}));
	});

	afterEach(() => Logger.overrideLogger(false));

	it("todo log dentro do contexto carrega fluxoId, osId e messageId no nível raiz", async () => {
		const base = pino({ level: "info" }, stream);
		const logger = new Logger("EnfileirarOrdemUseCase");

		const retorno = await executarComContextoLog(
			{ fluxoId: "f-1", osId: "os-1", messageId: "m-1", tipo: "SolicitarDiagnostico" },
			async () => {
				logger.log({ event: "execucao.ordem.enfileirada", ordemId: "o-1" });
				return 7;
			},
			base,
		);

		expect(retorno).toBe(7);
		expect(registros).toHaveLength(1);
		expect(registros[0]).toMatchObject({
			event: "execucao.ordem.enfileirada",
			ordemId: "o-1",
			fluxoId: "f-1",
			osId: "os-1",
			messageId: "m-1",
			tipo: "SolicitarDiagnostico",
		});
	});

	it("sem logger base disponível apenas executa a função", async () => {
		await expect(executarComContextoLog({ messageId: "m-2" }, () => Promise.resolve("ok"), undefined)).resolves.toBe("ok");
	});
});
