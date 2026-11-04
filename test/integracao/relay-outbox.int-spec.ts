import { StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import { randomUUID } from "node:crypto";
import { gravarOutbox } from "../../src/modules/execucao/adapters/gateways/ordens-execucao.prisma.gateway";
import { EnvelopeMensagem, criarEnvelope } from "../../src/modules/mensageria/envelope";
import { PublicadorMensagensPort } from "../../src/modules/mensageria/publicador-mensagens.port";
import { RelayOutbox } from "../../src/modules/mensageria/relay-outbox";
import { capturarCabecalhosTrace } from "../../src/modules/mensageria/trace";
import { PrismaService } from "../../src/prisma/prisma.service";
import { iniciarPostgres, limparBanco } from "../helpers/postgres";

jest.setTimeout(180_000);
jest.mock("../../src/modules/mensageria/trace", () => ({
	...jest.requireActual("../../src/modules/mensageria/trace"),
	capturarCabecalhosTrace: jest.fn(() => ({})),
}));

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

	it("publica o trace capturado ao gravar o outbox, não o do momento do envio", async () => {
		const mock = capturarCabecalhosTrace as jest.Mock;
		mock.mockReturnValue({ traceparent: "00-t-1-01" });
		const eventos = ["ReparoIniciado", "ReparoConcluido"].map((tipo) =>
			criarEnvelope({
				tipo,
				origem: "execution",
				fluxoId: randomUUID(),
				osId: randomUUID(),
				numeroOs: "OS-1",
				correlationId: "c",
				payload: {},
			}),
		);
		await prisma.$transaction((tx) => gravarOutbox(tx, eventos));
		mock.mockReturnValue({ traceparent: "00-outro-2-01" });

		const recebidos: unknown[] = [];
		const publicador: PublicadorMensagensPort = {
			enviarComando: async () => undefined,
			publicarEvento: async (_envelope, trace) => {
				recebidos.push(trace);
			},
		};
		await new RelayOutbox(prisma, publicador).processarLote();

		expect(recebidos).toEqual([{ traceparent: "00-t-1-01" }, { traceparent: "00-t-1-01" }]);
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
