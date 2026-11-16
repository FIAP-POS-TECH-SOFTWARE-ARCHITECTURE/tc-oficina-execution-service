import { Prisma } from "@prisma/client";
import { StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import { randomUUID } from "node:crypto";
import { setTimeout as esperar } from "node:timers/promises";
import { OrdensExecucaoPrismaGateway } from "../../src/modules/execucao/adapters/gateways/ordens-execucao.prisma.gateway";
import type { CancelarExecucaoPayload } from "../../src/modules/execucao/application/mensagens-execucao";
import { CancelarExecucaoUseCase } from "../../src/modules/execucao/application/use-cases/cancelar-execucao.use-case";
import { FluxoCanceladoError, TransicaoConcorrenteError } from "../../src/modules/execucao/domain/erros-execucao";
import { PrismaService } from "../../src/prisma/prisma.service";
import { comando } from "../helpers/fabricas";
import { iniciarPostgres, limparBanco } from "../helpers/postgres";

jest.setTimeout(180_000);

/**
 * Corrida entre criação e cancelamento do mesmo fluxo em réplicas diferentes: a transação que chega
 * depois tem de esperar o advisory lock da outra e enxergar o que ela gravou.
 */
describe("corrida cancelar × criar no mesmo fluxo (Postgres)", () => {
	let postgres: StartedPostgreSqlContainer;
	let prisma: PrismaService;
	let gateway: OrdensExecucaoPrismaGateway;

	beforeAll(async () => {
		({ container: postgres } = await iniciarPostgres());
		prisma = new PrismaService();
		await prisma.$connect();
		gateway = new OrdensExecucaoPrismaGateway(prisma);
	});

	afterAll(async () => {
		await prisma?.$disconnect();
		await postgres?.stop();
	});

	beforeEach(() => limparBanco(prisma));

	/** Segura o lock do fluxo numa transação aberta enquanto `concorrente` roda em outra conexão. */
	async function comLockDoFluxo<T>(
		fluxoId: string,
		gravar: (tx: Prisma.TransactionClient) => Promise<unknown>,
		concorrente: () => Promise<T>,
	) {
		let resultado!: Promise<T>;
		await prisma.$transaction(async (tx) => {
			await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${fluxoId}))`;
			await gravar(tx);
			resultado = concorrente();
			resultado.catch(() => undefined);
			await esperar(500);
		});
		return resultado;
	}

	it("cancelamento concorrente com a criação espera o lock, vê a ordem e volta à fila; a releitura cancela a ordem", async () => {
		const cancelar = comando<CancelarExecucaoPayload>("CancelarExecucao");
		const { fluxoId, osId } = cancelar;

		const tentativa = await comLockDoFluxo(
			fluxoId,
			(tx) => tx.ordemExecucao.create({ data: { id: randomUUID(), osId, fluxoId, numeroOs: "OS-1", etapa: "DIAGNOSTICO" } }),
			() => new CancelarExecucaoUseCase(gateway).execute(cancelar),
		).then(
			() => "resolveu",
			(erro: unknown) => erro,
		);

		expect(tentativa).toBeInstanceOf(TransicaoConcorrenteError);
		expect(await prisma.fluxoCancelado.count()).toBe(0);

		await new CancelarExecucaoUseCase(gateway).execute(cancelar);
		expect(await prisma.ordemExecucao.findFirstOrThrow({ where: { osId } })).toMatchObject({ status: "CANCELADA" });
		expect(await prisma.fluxoCancelado.count({ where: { fluxoId } })).toBe(1);
	});

	it("criação concorrente com o cancelamento espera o lock, vê o fluxo cancelado e não cria ordem", async () => {
		const solicitar = comando("SolicitarDiagnostico");
		const { fluxoId, osId } = solicitar;

		const tentativa = await comLockDoFluxo(
			fluxoId,
			(tx) => tx.fluxoCancelado.create({ data: { fluxoId, osId, motivo: "OS cancelada" } }),
			() =>
				gateway.criarOrdem({
					ordem: {
						id: randomUUID(),
						osId,
						fluxoId,
						numeroOs: "OS-1",
						etapa: "DIAGNOSTICO",
						cliente: null,
						veiculo: null,
						observacoesAtendimento: null,
						itens: [],
					},
					eventos: [],
					mensagem: { messageId: solicitar.messageId, tipo: solicitar.tipo },
				}),
		).then(
			() => "resolveu",
			(erro: unknown) => erro,
		);

		expect(tentativa).toBeInstanceOf(FluxoCanceladoError);
		expect(await prisma.ordemExecucao.count()).toBe(0);
		expect(await prisma.mensagemProcessada.count()).toBe(0);
	});
});
