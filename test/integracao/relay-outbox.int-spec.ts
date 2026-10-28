import { StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import { randomUUID } from "node:crypto";
import { EnvelopeMensagem } from "../../src/modules/mensageria/envelope";
import { PublicadorMensagensPort } from "../../src/modules/mensageria/publicador-mensagens.port";
import { RelayOutbox } from "../../src/modules/mensageria/relay-outbox";
import { PrismaService } from "../../src/prisma/prisma.service";
import { iniciarPostgres, limparBanco } from "../helpers/postgres";

jest.setTimeout(180_000);

describe("RelayOutbox com duas réplicas (Postgres)", () => {
	let postgres: StartedPostgreSqlContainer;
	let prisma: PrismaService;
	let publicados: string[];

	const registrar = async (envelope: EnvelopeMensagem<unknown>) => {
		await new Promise((r) => setTimeout(r, 5));
		publicados.push(envelope.messageId);
	};
	const publicadorContador: PublicadorMensagensPort = {
		enviarComando: (_fila, envelope) => registrar(envelope),
		publicarEvento: (envelope) => registrar(envelope),
	};

	beforeAll(async () => {
		({ container: postgres } = await iniciarPostgres());
		prisma = new PrismaService();
		await prisma.$connect();
	});

	afterAll(async () => {
		await prisma?.$disconnect();
		await postgres?.stop();
	});

	beforeEach(async () => {
		publicados = [];
		await limparBanco(prisma);
	});

	it("publica cada messageId exatamente uma vez", async () => {
		await prisma.outboxMensagem.createMany({
			data: Array.from({ length: 60 }, () => {
				const messageId = randomUUID();
				return { messageId, tipo: "ReparoIniciado", destino: "eventos", corpo: { messageId, tipo: "ReparoIniciado" } };
			}),
		});

		const r1 = new RelayOutbox(prisma, publicadorContador);
		const r2 = new RelayOutbox(prisma, publicadorContador);
		const drenar = async (r: RelayOutbox) => {
			while ((await r.processarLote()) > 0);
		};
		await Promise.all([drenar(r1), drenar(r2)]);

		expect(publicados).toHaveLength(60);
		expect(new Set(publicados).size).toBe(60);
		expect(await prisma.outboxMensagem.count({ where: { status: "ENVIADA" } })).toBe(60);
	});

	it("linha travada por outra transação é pulada sem bloquear", async () => {
		await prisma.outboxMensagem.create({ data: { messageId: randomUUID(), tipo: "ReparoIniciado", destino: "eventos", corpo: {} } });
		const inicio = Date.now();
		await prisma.$transaction(async (tx) => {
			await tx.$queryRaw`SELECT id FROM outbox_mensagens FOR UPDATE`;
			expect(await new RelayOutbox(prisma, publicadorContador).processarLote()).toBe(0);
		});
		expect(Date.now() - inicio).toBeLessThan(2000);
	});
});
