import { NestFactory } from "@nestjs/core";
import { Logger } from "nestjs-pino";
import { AppModule } from "./app.module";
import { CAMINHO_SWAGGER, configurarApp } from "./app.setup";

const VARIAVEIS_OBRIGATORIAS = [
	"PORT",
	"JWT_SECRET",
	"DATABASE_URL",
	"INTERNAL_API_KEY",
	"OS_SERVICE_URL",
	"SNS_EVENTOS_ARN",
	"SQS_EXECUCAO_COMANDOS_URL",
];

async function bootstrap() {
	const ausentes = VARIAVEIS_OBRIGATORIAS.filter((nome) => !process.env[nome]);
	if (ausentes.length > 0) throw new Error(`Variáveis de ambiente ausentes: ${ausentes.join(", ")}`);

	const app = await NestFactory.create(AppModule, { bufferLogs: true });
	app.useLogger(app.get(Logger));
	app.enableShutdownHooks();
	configurarApp(app);

	await app.listen(process.env.PORT as string);
	app.get(Logger).log(`Execution service na porta ${process.env.PORT}; documentação em /${CAMINHO_SWAGGER}`);
}

void bootstrap();
