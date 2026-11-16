import { PostgreSqlContainer, StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import { execSync } from "node:child_process";
import { PrismaService } from "../../src/prisma/prisma.service";

export async function iniciarPostgres(): Promise<{ container: StartedPostgreSqlContainer; databaseUrl: string }> {
	const container = await new PostgreSqlContainer("postgres:18-alpine").withDatabase("execution_test").start();
	const databaseUrl = `${container.getConnectionUri()}?schema=public`;
	execSync("npx prisma migrate deploy", { stdio: "inherit", env: { ...process.env, DATABASE_URL: databaseUrl } });
	process.env.DATABASE_URL = databaseUrl;
	return { container, databaseUrl };
}

export async function limparBanco(prisma: PrismaService): Promise<void> {
	await prisma.$executeRawUnsafe(
		"TRUNCATE TABLE historico_execucao, itens_execucao, ordens_execucao, fluxos_cancelados, outbox_mensagens, mensagens_processadas CASCADE",
	);
}
