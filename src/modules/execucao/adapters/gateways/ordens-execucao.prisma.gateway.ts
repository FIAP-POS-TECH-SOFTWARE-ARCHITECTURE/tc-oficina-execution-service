import { Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../../../../prisma/prisma.service";
import type { EnvelopeMensagem } from "../../../mensageria/envelope";
import {
	AtualizacaoItem,
	CancelamentoFluxo,
	HistoricoExecucaoItem,
	MensagemJaProcessadaError,
	MensagemRecebida,
	NovaOrdemExecucao,
	OrdensExecucaoGatewayPort,
	PegarProximaParams,
	TransicaoOrdemExecucao,
} from "../../application/ports/ordens-execucao.gateway";
import { FluxoCanceladoError, TransicaoConcorrenteError } from "../../domain/erros-execucao";
import { EtapaExecucao, OrdemExecucao, STATUS_ATIVOS, StatusOrdemExecucao } from "../../domain/ordem-execucao";
import { INCLUIR_ITENS, jsonOuDbNull, paraOrdemExecucao } from "./mapeador-ordem-execucao";

type Tx = Prisma.TransactionClient;

export async function registrarMensagem(tx: Tx, mensagem: MensagemRecebida): Promise<void> {
	const { count } = await tx.mensagemProcessada.createMany({
		data: [{ messageId: mensagem.messageId, tipo: mensagem.tipo }],
		skipDuplicates: true,
	});
	if (count === 0) throw new MensagemJaProcessadaError(mensagem.messageId);
}

export async function gravarOutbox(tx: Tx, eventos: EnvelopeMensagem<unknown>[]): Promise<void> {
	if (eventos.length === 0) return;
	await tx.outboxMensagem.createMany({
		data: eventos.map((e) => ({
			messageId: e.messageId,
			fluxoId: e.fluxoId,
			tipo: e.tipo,
			destino: "eventos",
			corpo: e as unknown as Prisma.InputJsonValue,
		})),
	});
}

/**
 * Serializa, entre réplicas, criação e cancelamento do mesmo fluxo (a mensagem perdedora volta à fila).
 * A conferência feita depois do lock só enxerga o commit da outra transação em READ COMMITTED (padrão do
 * Postgres): não subir o isolamento destas transações nem mover a conferência para antes do lock.
 */
async function travarFluxo(tx: Tx, fluxoId: string): Promise<void> {
	await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${fluxoId}))`;
}

async function gravarFluxoCancelado(tx: Tx, c: CancelamentoFluxo): Promise<void> {
	await tx.fluxoCancelado.createMany({ data: [{ fluxoId: c.fluxoId, osId: c.osId, motivo: c.motivo }], skipDuplicates: true });
}

export const buscarNaTx = async (tx: Tx, id: string) =>
	paraOrdemExecucao(await tx.ordemExecucao.findUniqueOrThrow({ where: { id }, include: INCLUIR_ITENS }));

@Injectable()
export class OrdensExecucaoPrismaGateway implements OrdensExecucaoGatewayPort {
	constructor(protected readonly prisma: PrismaService) {}

	async buscarPorId(id: string): Promise<OrdemExecucao | null> {
		const r = await this.prisma.ordemExecucao.findUnique({ where: { id }, include: INCLUIR_ITENS });
		return r ? paraOrdemExecucao(r) : null;
	}

	async buscarPorOsEEtapa(osId: string, etapa: EtapaExecucao): Promise<OrdemExecucao | null> {
		const r = await this.prisma.ordemExecucao.findUnique({ where: { osId_etapa: { osId, etapa } }, include: INCLUIR_ITENS });
		return r ? paraOrdemExecucao(r) : null;
	}

	async listarPorOs(osId: string): Promise<OrdemExecucao[]> {
		const rs = await this.prisma.ordemExecucao.findMany({ where: { osId }, orderBy: { createdAt: "desc" }, include: INCLUIR_ITENS });
		return rs.map(paraOrdemExecucao);
	}

	async buscarFluxoCancelado(fluxoId: string): Promise<{ motivo: string } | null> {
		return this.prisma.fluxoCancelado.findUnique({ where: { fluxoId }, select: { motivo: true } });
	}

	async criarOrdem(d: {
		ordem: NovaOrdemExecucao;
		eventos: EnvelopeMensagem<unknown>[];
		mensagem: MensagemRecebida;
	}): Promise<OrdemExecucao> {
		const { ordem } = d;
		return this.prisma.$transaction(async (tx) => {
			await registrarMensagem(tx, d.mensagem);
			await travarFluxo(tx, ordem.fluxoId);
			const cancelado = await tx.fluxoCancelado.findUnique({ where: { fluxoId: ordem.fluxoId } });
			if (cancelado) throw new FluxoCanceladoError(ordem.fluxoId, cancelado.motivo);
			await tx.ordemExecucao.create({
				data: {
					id: ordem.id,
					osId: ordem.osId,
					fluxoId: ordem.fluxoId,
					numeroOs: ordem.numeroOs,
					etapa: ordem.etapa,
					cliente: jsonOuDbNull(ordem.cliente),
					veiculo: jsonOuDbNull(ordem.veiculo),
					observacoesAtendimento: ordem.observacoesAtendimento,
					itens: { create: ordem.itens },
				},
			});
			await tx.historicoExecucao.create({
				data: {
					ordemExecucaoId: ordem.id,
					statusAnterior: null,
					statusNovo: "PENDENTE",
					usuarioId: null,
					observacao: ordem.etapa === "DIAGNOSTICO" ? "Ordem de diagnóstico enfileirada" : "Ordem de reparo enfileirada",
					messageId: d.eventos[0]?.messageId ?? null,
				},
			});
			await gravarOutbox(tx, d.eventos);
			return buscarNaTx(tx, ordem.id);
		});
	}

	async registrarSemEfeito(d: { eventos: EnvelopeMensagem<unknown>[]; mensagem: MensagemRecebida }): Promise<void> {
		await this.prisma.$transaction(async (tx) => {
			await registrarMensagem(tx, d.mensagem);
			await gravarOutbox(tx, d.eventos);
		});
	}

	async registrarCancelamentoDoFluxo(
		d: CancelamentoFluxo & { eventos: EnvelopeMensagem<unknown>[]; mensagem: MensagemRecebida },
	): Promise<void> {
		await this.prisma.$transaction(async (tx) => {
			await registrarMensagem(tx, d.mensagem);
			await travarFluxo(tx, d.fluxoId);
			const ativas = await tx.ordemExecucao.count({ where: { osId: d.osId, status: { in: [...STATUS_ATIVOS] } } });
			// Ordem criada em paralelo: a mensagem volta à fila e, na releitura, o caso de uso cancela a ordem ativa.
			if (ativas > 0) throw new TransicaoConcorrenteError(d.osId);
			await gravarFluxoCancelado(tx, d);
			await gravarOutbox(tx, d.eventos);
		});
	}

	async transicionar(t: TransicaoOrdemExecucao): Promise<OrdemExecucao> {
		return this.prisma.$transaction(async (tx) => {
			if (t.mensagem) await registrarMensagem(tx, t.mensagem);
			const [travada] = await tx.$queryRaw<{ status: StatusOrdemExecucao }[]>`
				SELECT status::text AS status FROM ordens_execucao WHERE id = ${t.ordemId}::uuid FOR UPDATE`;
			if (!travada || !t.de.includes(travada.status)) throw new TransicaoConcorrenteError(t.ordemId);

			await tx.ordemExecucao.update({ where: { id: t.ordemId }, data: { status: t.para, ...(t.dados ?? {}) } });
			if (t.itensNovos?.length)
				await tx.itemExecucao.createMany({ data: t.itensNovos.map((i) => ({ ...i, ordemExecucaoId: t.ordemId })) });
			if (t.concluirItensServicoEm) {
				const em = t.concluirItensServicoEm;
				await tx.itemExecucao.updateMany({
					where: { ordemExecucaoId: t.ordemId, tipo: "SERVICO", iniciadoEm: null },
					data: { iniciadoEm: em },
				});
				await tx.itemExecucao.updateMany({
					where: { ordemExecucaoId: t.ordemId, tipo: "SERVICO", status: { not: "CONCLUIDO" } },
					data: { status: "CONCLUIDO", concluidoEm: em },
				});
			}
			if (t.registrarFluxoCancelado) await gravarFluxoCancelado(tx, t.registrarFluxoCancelado);
			await tx.historicoExecucao.create({
				data: {
					ordemExecucaoId: t.ordemId,
					statusAnterior: travada.status,
					statusNovo: t.para,
					usuarioId: t.usuarioId,
					observacao: t.observacao,
					messageId: t.eventos[0]?.messageId ?? null,
				},
			});
			await gravarOutbox(tx, t.eventos);
			return buscarNaTx(tx, t.ordemId);
		});
	}

	async listarFila(etapa: EtapaExecucao): Promise<OrdemExecucao[]> {
		const rs = await this.prisma.ordemExecucao.findMany({
			where: { etapa, status: "PENDENTE" },
			orderBy: [{ createdAt: "asc" }, { id: "asc" }],
			include: INCLUIR_ITENS,
		});
		return rs.map(paraOrdemExecucao);
	}

	/** Duas transações concorrentes nunca recebem a mesma linha: a travada é pulada, não esperada. */
	async pegarProxima(p: PegarProximaParams): Promise<OrdemExecucao | null> {
		return this.prisma.$transaction(async (tx) => {
			const [livre] = await tx.$queryRaw<{ id: string }[]>`
				SELECT id FROM ordens_execucao
				WHERE etapa = CAST(${p.etapa} AS "EtapaExecucao") AND status = 'PENDENTE'
				ORDER BY created_at, id
				LIMIT 1
				FOR UPDATE SKIP LOCKED`;
			if (!livre) return null;
			const evento = p.montarEvento(await buscarNaTx(tx, livre.id));
			await tx.ordemExecucao.update({
				where: { id: livre.id },
				data: { status: "EM_ANDAMENTO", mecanicoId: p.mecanicoId, iniciadaEm: p.agora },
			});
			await tx.historicoExecucao.create({
				data: {
					ordemExecucaoId: livre.id,
					statusAnterior: "PENDENTE",
					statusNovo: "EM_ANDAMENTO",
					usuarioId: p.mecanicoId,
					observacao: "Ordem pega da fila pelo mecânico",
					messageId: evento.messageId,
				},
			});
			await gravarOutbox(tx, [evento]);
			return buscarNaTx(tx, livre.id);
		});
	}

	async listarHistorico(ordemId: string): Promise<HistoricoExecucaoItem[]> {
		return this.prisma.historicoExecucao.findMany({
			where: { ordemExecucaoId: ordemId },
			orderBy: { createdAt: "asc" },
			select: {
				id: true,
				statusAnterior: true,
				statusNovo: true,
				usuarioId: true,
				observacao: true,
				messageId: true,
				createdAt: true,
			},
		});
	}

	async atualizarItem(p: AtualizacaoItem): Promise<OrdemExecucao> {
		return this.prisma.$transaction(async (tx) => {
			const [travada] = await tx.$queryRaw<{ status: StatusOrdemExecucao }[]>`
				SELECT status::text AS status FROM ordens_execucao WHERE id = ${p.ordemId}::uuid FOR UPDATE`;
			if (travada?.status !== "EM_ANDAMENTO") throw new TransicaoConcorrenteError(p.ordemId);
			const data = p.para === "EM_EXECUCAO" ? { status: p.para, iniciadoEm: p.em } : { status: p.para, concluidoEm: p.em };
			const { count } = await tx.itemExecucao.updateMany({
				where: { id: p.itemId, ordemExecucaoId: p.ordemId, tipo: "SERVICO", status: p.de },
				data,
			});
			if (count === 0) throw new TransicaoConcorrenteError(p.ordemId);
			await tx.historicoExecucao.create({
				data: {
					ordemExecucaoId: p.ordemId,
					statusAnterior: "EM_ANDAMENTO",
					statusNovo: "EM_ANDAMENTO",
					usuarioId: p.usuarioId,
					observacao: p.observacao,
					messageId: null,
				},
			});
			return buscarNaTx(tx, p.ordemId);
		});
	}
}
