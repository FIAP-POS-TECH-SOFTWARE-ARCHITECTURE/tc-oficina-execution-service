import { SendMessageCommand, SQSClient } from "@aws-sdk/client-sqs";
import { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import { randomUUID } from "node:crypto";
import { AppModule } from "../../src/app.module";
import type { SolicitarDiagnosticoPayload } from "../../src/modules/execucao/application/mensagens-execucao";
import { ConsumidorComandosExecucao } from "../../src/modules/execucao/adapters/mensageria/consumidor-comandos-execucao";
import { montarAtributos } from "../../src/modules/mensageria/atributos-mensagem";
import { ConsumidorSqs } from "../../src/modules/mensageria/consumidor-sqs";
import { criarEnvelope, EnvelopeMensagem } from "../../src/modules/mensageria/envelope";
import { PUBLICADOR_MENSAGENS, PublicadorMensagensPort } from "../../src/modules/mensageria/publicador-mensagens.port";
import { RelayOutbox } from "../../src/modules/mensageria/relay-outbox";
import { ValidadorContratos } from "../../src/modules/mensageria/validador-contratos";
import { PrismaService } from "../../src/prisma/prisma.service";
import { comando } from "../helpers/fabricas";
import { configurarAmbienteAws, iniciarMiniStack, MiniStackIniciado } from "../helpers/ministack";
import { iniciarPostgres, limparBanco } from "../helpers/postgres";
import { criarTopologia, receberTodas } from "../helpers/topologia-mensageria";

jest.setTimeout(180_000);

describe("comandos do orquestrador → ordens e eventos (Postgres + MiniStack)", () => {
	let ministack: MiniStackIniciado;
	let postgres: StartedPostgreSqlContainer;
	let app: INestApplication;
	let prisma: PrismaService;
	let filas: Awaited<ReturnType<typeof criarTopologia>>;

	const enviar = (e: EnvelopeMensagem<unknown>) =>
		new SQSClient({}).send(
			new SendMessageCommand({ QueueUrl: filas.comandosUrl, MessageBody: JSON.stringify(e), MessageAttributes: montarAtributos(e) }),
		);
	const consumir = async () => {
		const adapter = app.get(ConsumidorComandosExecucao);
		while ((await app.get(ConsumidorSqs).processarLote(filas.comandosUrl, (e) => adapter.processar(e), ["os"])) > 0);
	};
	const publicar = async () => {
		while ((await app.get(RelayOutbox).processarLote()) > 0);
	};

	beforeAll(async () => {
		[ministack, { container: postgres }] = await Promise.all([iniciarMiniStack(), iniciarPostgres()]);
		configurarAmbienteAws(ministack.endpoint);
		filas = await criarTopologia("teste");
		Object.assign(process.env, {
			SQS_EXECUCAO_COMANDOS_URL: filas.comandosUrl,
			SNS_EVENTOS_ARN: filas.topicoArn,
			WORKERS_HABILITADOS: "false",
			JWT_SECRET: "s",
		});
		app = (await Test.createTestingModule({ imports: [AppModule] }).compile()).createNestApplication();
		await app.init();
		prisma = app.get(PrismaService);
	});

	afterAll(async () => {
		await app?.close();
		await Promise.all([ministack?.container.stop(), postgres?.stop()]);
	});

	beforeEach(() => limparBanco(prisma));

	it("SolicitarDiagnostico: ordem PENDENTE e ExecucaoEnfileirada chega ao orquestrador pelo filtro de origem", async () => {
		const cmd = comando("SolicitarDiagnostico");
		await enviar(cmd);
		await consumir();
		const ordem = await prisma.ordemExecucao.findUniqueOrThrow({ where: { osId_etapa: { osId: cmd.osId, etapa: "DIAGNOSTICO" } } });
		expect(ordem.status).toBe("PENDENTE");
		await publicar();
		const [evento] = await receberTodas(filas.orquestradorUrl, 1);
		expect(evento.atributos).toEqual({ tipo: "ExecucaoEnfileirada", origem: "execution" });
		expect(evento.corpo.payload).toEqual({ etapa: "DIAGNOSTICO", ordemExecucaoId: ordem.id });
		expect(new ValidadorContratos().validar(evento.corpo).valido).toBe(true);
	});

	it("mesmo messageId duas vezes: 1 ordem, 1 evento; messageId novo: reemite a mesma ordem", async () => {
		const cmd = comando("SolicitarDiagnostico");
		await enviar(cmd);
		await enviar(cmd);
		await consumir();
		expect(await prisma.outboxMensagem.count()).toBe(1);
		await enviar({ ...cmd, messageId: randomUUID() });
		await consumir();
		await publicar();
		const eventos = await receberTodas(filas.orquestradorUrl, 2);
		expect(await prisma.ordemExecucao.count()).toBe(1);
		expect(new Set(eventos.map((e) => (e.corpo.payload as { ordemExecucaoId: string }).ordemExecucaoId)).size).toBe(1);
	});

	it("regra 4: CancelarExecucao antes do SolicitarDiagnostico → nenhuma ordem e 2 ExecucaoCancelada{etapa:null}", async () => {
		const solicitar = comando("SolicitarDiagnostico");
		await enviar(comando("CancelarExecucao", { fluxoId: solicitar.fluxoId, osId: solicitar.osId }));
		await consumir();
		await enviar(solicitar);
		await consumir();
		await publicar();
		const eventos = await receberTodas(filas.orquestradorUrl, 2);
		expect(await prisma.ordemExecucao.count()).toBe(0);
		expect(eventos.map((e) => [e.corpo.tipo, (e.corpo.payload as { etapa: unknown }).etapa])).toEqual([
			["ExecucaoCancelada", null],
			["ExecucaoCancelada", null],
		]);
	});

	it("IniciarReparo copia o snapshot; CancelarExecucao depois cancela a ordem ativa", async () => {
		const solicitar = comando<SolicitarDiagnosticoPayload>("SolicitarDiagnostico");
		const ids = { fluxoId: solicitar.fluxoId, osId: solicitar.osId };
		await enviar(solicitar);
		await consumir();
		await prisma.ordemExecucao.updateMany({ where: ids, data: { status: "CONCLUIDA" } });
		await enviar(comando("IniciarReparo", ids));
		await consumir();
		await enviar(comando("CancelarExecucao", ids));
		await consumir();
		const reparo = await prisma.ordemExecucao.findUniqueOrThrow({
			where: { osId_etapa: { osId: ids.osId, etapa: "REPARO" } },
			include: { itens: true },
		});
		expect(reparo.cliente).toEqual(solicitar.payload.cliente);
		expect(reparo.itens.length).toBeGreaterThan(0);
		expect(reparo.status).toBe("CANCELADA");
		expect(await prisma.fluxoCancelado.count({ where: { fluxoId: ids.fluxoId } })).toBe(1);
	});

	it("evento com origem os não passa pelo filtro da assinatura", async () => {
		const publicador = app.get<PublicadorMensagensPort>(PUBLICADOR_MENSAGENS);
		await publicador.publicarEvento(
			criarEnvelope({
				tipo: "FluxoConcluido",
				fluxoId: randomUUID(),
				osId: randomUUID(),
				numeroOs: "n",
				correlationId: "c",
				payload: {},
			}),
		);
		expect(await receberTodas(filas.orquestradorUrl, 1, 3000)).toEqual([]);
	});
});
