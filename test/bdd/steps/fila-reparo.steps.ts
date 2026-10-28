import { INestApplication } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { Test } from "@nestjs/testing";
import { StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import { autoBindSteps, loadFeature, StepDefinitions } from "jest-cucumber";
import { randomUUID } from "node:crypto";
import path from "node:path";
import request from "supertest";
import { AppModule } from "../../../src/app.module";
import { configurarApp } from "../../../src/app.setup";
import { Role } from "../../../src/common/enums/role.enum";
import { ConsumidorComandosExecucao } from "../../../src/modules/execucao/adapters/mensageria/consumidor-comandos-execucao";
import { CATALOGO_OS } from "../../../src/modules/execucao/application/ports/catalogo-os.port";
import type { EnvelopeMensagem } from "../../../src/modules/mensageria/envelope";
import { ValidadorContratos } from "../../../src/modules/mensageria/validador-contratos";
import { PrismaService } from "../../../src/prisma/prisma.service";
import { CatalogoMemoria } from "../../helpers/catalogo-memoria";
import { comando } from "../../helpers/fabricas";
import { iniciarPostgres, limparBanco } from "../../helpers/postgres";

jest.setTimeout(120_000);

const feature = loadFeature(path.join(__dirname, "..", "features", "fila-reparo.feature"));
const catalogo = new CatalogoMemoria();
const validador = new ValidadorContratos();
let postgres: StartedPostgreSqlContainer;
let app: INestApplication;
let prisma: PrismaService;
const usuarios: Record<string, { id: string; token: string }> = {};
let criadas: EnvelopeMensagem[] = [];
let atual: EnvelopeMensagem;
let ordemId: string;
let resposta: request.Response;
let respostas: request.Response[] = [];

beforeAll(async () => {
	({ container: postgres } = await iniciarPostgres());
	Object.assign(process.env, {
		WORKERS_HABILITADOS: "false",
		JWT_SECRET: "segredo-bdd",
		SQS_EXECUCAO_COMANDOS_URL: "http://127.0.0.1:1/fila",
		SNS_EVENTOS_ARN: "arn:aws:sns:us-east-1:000000000000:nao-usado",
	});
	const modulo = await Test.createTestingModule({ imports: [AppModule] })
		.overrideProvider(CATALOGO_OS)
		.useValue(catalogo)
		.compile();
	app = modulo.createNestApplication();
	configurarApp(app);
	await app.init();
	prisma = app.get(PrismaService);
});

afterAll(async () => {
	await app?.close();
	await postgres?.stop();
});

beforeEach(async () => {
	await limparBanco(prisma);
	catalogo.limpar();
	criadas = [];
	respostas = [];
});

function usuario(nome: string, role: Role = Role.MECANICO) {
	if (!usuarios[nome]) {
		const id = randomUUID();
		const token = app.get(JwtService).sign({ sub: id, email: `${nome}@oficina.local`, role }, { secret: process.env.JWT_SECRET });
		usuarios[nome] = { id, token };
	}
	return usuarios[nome];
}

const post = (nome: string, url: string, corpo: object = {}) =>
	request(app.getHttpServer())
		.post(url)
		.set("Authorization", `Bearer ${usuario(nome).token}`)
		.send(corpo);
const get = (nome: string, url: string) =>
	request(app.getHttpServer())
		.get(url)
		.set("Authorization", `Bearer ${usuario(nome).token}`);
const pegar = (nome: string, etapa: string) => post(nome, `/execucao/fila/${etapa}/proxima`);

async function enfileirar(tipo: "SolicitarDiagnostico" | "IniciarReparo") {
	const cmd = comando(tipo);
	await app.get(ConsumidorComandosExecucao).processar(cmd);
	criadas.push(cmd);
	atual = cmd;
	await new Promise((r) => setTimeout(r, 5)); // created_at distinto entre ordens
}

async function eventos(tipo: string): Promise<EnvelopeMensagem[]> {
	const linhas = await prisma.outboxMensagem.findMany({ where: { tipo }, orderBy: { createdAt: "asc" } });
	const lista = linhas.map((l) => l.corpo as unknown as EnvelopeMensagem);
	for (const e of lista) expect(validador.validar(e).valido).toBe(true);
	return lista;
}

const idDoCatalogo = (nome: string) => [...catalogo.servicos, ...catalogo.insumos].find((i) => i.nome === nome)!;

const passos: StepDefinitions = ({ given, when, then, and }) => {
	given(/^o catálogo do OS com o serviço "(.+)" e o insumo "(.+)"$/, (servico: string, insumo: string) => {
		catalogo.servicos = [{ id: randomUUID(), nome: servico, descricao: null, precoCentavos: 12000, tempoEstimadoMin: 30 }];
		catalogo.insumos = [{ id: randomUUID(), codigo: "OLEO-5W30", nome: insumo, precoCentavos: 4500, quantidadeEstoque: 10 }];
	});

	given(/^(\d+) orde(?:m|ns) de diagnóstico na fila$/, async (n: string) => {
		for (let i = 0; i < Number(n); i++) await enfileirar("SolicitarDiagnostico");
	});

	given(/^uma ordem de (diagnóstico|reparo) em andamento com o mecânico "(.+)"$/, async (etapa: string, nome: string) => {
		await enfileirar(etapa === "diagnóstico" ? "SolicitarDiagnostico" : "IniciarReparo");
		const r = await pegar(nome, etapa === "diagnóstico" ? "DIAGNOSTICO" : "REPARO");
		expect(r.status).toBe(200);
		ordemId = (r.body as { data: { id: string } }).data.id;
	});

	and("o orquestrador cancela a execução da OS", async () => {
		await app.get(ConsumidorComandosExecucao).processar(comando("CancelarExecucao", { fluxoId: atual.fluxoId, osId: atual.osId }));
	});

	when(/^o mecânico "(.+)" pede a próxima ordem de "(DIAGNOSTICO|REPARO)"$/, async (nome: string, etapa: string) => {
		resposta = await pegar(nome, etapa);
	});

	when(
		/^o mecânico "(.+)" registra o diagnóstico com (\d+) "(.+)" e (\d+) "(.+)"$/,
		async (nome: string, q1: string, n1: string, q2: string, n2: string) => {
			const item = (nomeItem: string, q: string) => ({
				tipo: catalogo.servicos.some((s) => s.nome === nomeItem) ? "SERVICO" : "INSUMO",
				referenciaId: idDoCatalogo(nomeItem).id,
				quantidade: Number(q),
			});
			resposta = await post(nome, `/execucao/ordens/${ordemId}/diagnostico`, {
				diagnostico: "Troca de óleo e filtro",
				itens: [item(n1, q1), item(n2, q2)],
			});
		},
	);

	when(/^o mecânico "(.+)" registra o diagnóstico com um serviço inexistente$/, async (nome: string) => {
		resposta = await post(nome, `/execucao/ordens/${ordemId}/diagnostico`, {
			diagnostico: "x",
			itens: [{ tipo: "SERVICO", referenciaId: randomUUID(), quantidade: 1 }],
		});
	});

	when(/^o mecânico "(.+)" rejeita o diagnóstico com o motivo "(.+)"$/, async (nome: string, motivo: string) => {
		resposta = await post(nome, `/execucao/ordens/${ordemId}/diagnostico/rejeitar`, { motivo });
	});

	when(/^o mecânico "(.+)" conclui o reparo$/, async (nome: string) => {
		resposta = await post(nome, `/execucao/ordens/${ordemId}/reparo/concluir`);
	});

	when(/^o mecânico "(.+)" declara o reparo inviável com o motivo "(.+)"$/, async (nome: string, motivo: string) => {
		resposta = await post(nome, `/execucao/ordens/${ordemId}/reparo/inviavel`, { motivo });
	});

	when(
		/^os mecânicos "(.+)" e "(.+)" pedem a próxima ordem de "(DIAGNOSTICO|REPARO)" ao mesmo tempo$/,
		async (a: string, b: string, etapa: string) => {
			respostas = await Promise.all([pegar(a, etapa), pegar(b, etapa)]);
		},
	);

	then("recebe a ordem mais antiga em andamento", () => {
		expect(resposta.status).toBe(200);
		expect((resposta.body as { data: unknown }).data).toMatchObject({ osId: criadas[0].osId, status: "EM_ANDAMENTO" });
	});

	then(/^a resposta é (\d+)$/, (status: string) => {
		expect(resposta.status).toBe(Number(status));
	});

	and(/^o evento "(.+)" é publicado para o mecânico "(.+)"$/, async (tipo: string, nome: string) => {
		expect((await eventos(tipo)).map((e) => e.payload)).toEqual([{ mecanicoId: usuario(nome).id }]);
	});

	and(/^o evento "(.+)" é publicado com (\d+) itens$/, async (tipo: string, n: string) => {
		const [evento] = await eventos(tipo);
		expect((evento.payload as { itens: unknown[] }).itens).toHaveLength(Number(n));
	});

	and(/^o evento "([^"]+)" é publicado$/, async (tipo: string) => {
		expect(await eventos(tipo)).toHaveLength(1);
	});

	and(/^nenhum evento "(.+)" é publicado$/, async (tipo: string) => {
		expect(await eventos(tipo)).toHaveLength(0);
	});

	and(/^a fila de "(.+)" fica com (\d+) ordem$/, async (etapa: string, n: string) => {
		expect(((await get("ana", `/execucao/fila?etapa=${etapa}`)).body as { data: unknown[] }).data).toHaveLength(Number(n));
	});

	and("todos os itens de serviço da ordem ficam concluídos", async () => {
		const corpo = (await get("bruno", `/execucao/ordens/${ordemId}`)).body as {
			data: { itens: { tipo: string; status: string }[] };
		};
		expect(corpo.data.itens.filter((i) => i.tipo === "SERVICO").every((i) => i.status === "CONCLUIDO")).toBe(true);
	});

	then("exatamente um recebe a ordem e o outro recebe 404", () => {
		expect(respostas.map((r) => r.status).sort()).toEqual([200, 404]);
	});
};

autoBindSteps([feature], [passos]);
