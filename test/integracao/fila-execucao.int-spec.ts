import { INestApplication } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { Test } from "@nestjs/testing";
import { StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import { randomUUID } from "node:crypto";
import request from "supertest";
import { AppModule } from "../../src/app.module";
import { configurarApp } from "../../src/app.setup";
import { Role } from "../../src/common/enums/role.enum";
import { ConsumidorComandosExecucao } from "../../src/modules/execucao/adapters/mensageria/consumidor-comandos-execucao";
import { criarEventoExecucao } from "../../src/modules/execucao/application/eventos-execucao";
import {
	ORDENS_EXECUCAO_GATEWAY,
	OrdensExecucaoGatewayPort,
} from "../../src/modules/execucao/application/ports/ordens-execucao.gateway";
import { PrismaService } from "../../src/prisma/prisma.service";
import { comando } from "../helpers/fabricas";
import { iniciarOsStub } from "../helpers/os-stub";
import { iniciarPostgres, limparBanco } from "../helpers/postgres";

jest.setTimeout(180_000);

const SERVICO = { id: randomUUID(), nome: "Troca de óleo", descricao: null, precoCentavos: 12000, tempoEstimadoMin: 30 };

describe("filas com Postgres real e catálogo do OS por HTTP", () => {
	let postgres: StartedPostgreSqlContainer;
	let os: Awaited<ReturnType<typeof iniciarOsStub>>;
	let app: INestApplication;
	let prisma: PrismaService;
	let gateway: OrdensExecucaoGatewayPort;

	const enfileirar = async (n: number) => {
		for (let i = 0; i < n; i++) {
			await app.get(ConsumidorComandosExecucao).processar(comando("SolicitarDiagnostico"));
			await new Promise((r) => setTimeout(r, 5));
		}
	};
	const pegar = (mecanicoId: string) =>
		gateway.pegarProxima({
			etapa: "DIAGNOSTICO",
			mecanicoId,
			agora: new Date(),
			montarEvento: (o) => criarEventoExecucao(o, "DiagnosticoIniciado", { mecanicoId }, "c"),
		});
	const tokenDe = (mecanicoId: string) =>
		app.get(JwtService).sign({ sub: mecanicoId, email: "m@o", role: Role.MECANICO }, { secret: process.env.JWT_SECRET });

	beforeAll(async () => {
		[{ container: postgres }, os] = await Promise.all([
			iniciarPostgres(),
			iniciarOsStub("chave-teste", { servicos: [SERVICO], insumos: [] }),
		]);
		Object.assign(process.env, {
			WORKERS_HABILITADOS: "false",
			JWT_SECRET: "s",
			INTERNAL_API_KEY: "chave-teste",
			OS_SERVICE_URL: os.url,
			SQS_EXECUCAO_COMANDOS_URL: "http://127.0.0.1:1/fila",
			SNS_EVENTOS_ARN: "arn:aws:sns:us-east-1:000000000000:nao-usado",
		});
		app = (await Test.createTestingModule({ imports: [AppModule] }).compile()).createNestApplication();
		configurarApp(app);
		await app.init();
		prisma = app.get(PrismaService);
		gateway = app.get(ORDENS_EXECUCAO_GATEWAY);
	});

	afterAll(async () => {
		await app?.close();
		await Promise.all([postgres?.stop(), os?.fechar()]);
	});

	beforeEach(() => limparBanco(prisma));

	it("ordem travada por outra transação é pulada sem bloquear", async () => {
		await enfileirar(1);
		const inicio = Date.now();
		await prisma.$transaction(async (tx) => {
			await tx.$queryRaw`SELECT id FROM ordens_execucao FOR UPDATE`;
			expect(await pegar(randomUUID())).toBeNull();
		});
		expect(Date.now() - inicio).toBeLessThan(2000);
		expect(await pegar(randomUUID())).not.toBeNull();
	});

	it("10 mecânicos concorrentes em 5 ordens: 5 ordens distintas e 5 filas vazias (repetir 3×)", async () => {
		for (let rodada = 0; rodada < 3; rodada++) {
			await limparBanco(prisma);
			await enfileirar(5);
			const resultados = await Promise.all(Array.from({ length: 10 }, () => pegar(randomUUID())));
			const pegas = resultados.filter((o) => o !== null).map((o) => o.id);
			expect(pegas).toHaveLength(5);
			expect(new Set(pegas).size).toBe(5);
			expect(await prisma.outboxMensagem.count({ where: { tipo: "DiagnosticoIniciado" } })).toBe(5);
		}
	});

	it("diagnóstico consulta o catálogo do OS por REST (com a chave interna) e grava o evento do contrato", async () => {
		await enfileirar(1);
		const mecanicoId = randomUUID();
		const ordem = await pegar(mecanicoId);
		const r = await request(app.getHttpServer())
			.post(`/execucao/ordens/${ordem!.id}/diagnostico`)
			.set("Authorization", `Bearer ${tokenDe(mecanicoId)}`)
			.send({ diagnostico: "Troca de óleo", itens: [{ tipo: "SERVICO", referenciaId: SERVICO.id, quantidade: 1 }] });
		expect(r.status).toBe(200);
		expect(os.chamadas).toContain("/internal/catalogo/servicos");
		const [linha] = await prisma.outboxMensagem.findMany({ where: { tipo: "DiagnosticoConcluido" } });
		expect((linha.corpo as { payload: unknown }).payload).toEqual({
			mecanicoId,
			diagnostico: "Troca de óleo",
			itens: [{ tipo: "SERVICO", referenciaId: SERVICO.id, quantidade: 1 }],
		});
	});

	// Fecha o stub: tem de ser o último caso do arquivo.
	it("OS fora do ar → 503 com mensagem clara e nada gravado", async () => {
		await enfileirar(1);
		const mecanicoId = randomUUID();
		const ordem = await pegar(mecanicoId);
		await os.fechar();
		const r = await request(app.getHttpServer())
			.post(`/execucao/ordens/${ordem!.id}/diagnostico`)
			.set("Authorization", `Bearer ${tokenDe(mecanicoId)}`)
			.send({ diagnostico: "x", itens: [{ tipo: "SERVICO", referenciaId: randomUUID(), quantidade: 1 }] });
		expect(r.status).toBe(503);
		expect((r.body as { message: string }).message).toMatch(/Catálogo do OS indisponível/);
		expect(await prisma.outboxMensagem.count({ where: { tipo: "DiagnosticoConcluido" } })).toBe(0);
	});
});
