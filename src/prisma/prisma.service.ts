import { Injectable, OnModuleInit } from "@nestjs/common";
import { PrismaClient } from "@prisma/client";

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit {
	async onModuleInit() {
		try {
			await this.$connect();
			console.log("✅ Conectado ao banco de dados com sucesso!");
		} catch (error: unknown) {
			const message = error instanceof Error ? error.message : String(error);
			console.error("❌ Falha ao conectar ao banco de dados:", message);
			process.exit(1);
		}
	}
}
