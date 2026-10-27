import { Prisma } from "@prisma/client";
import type { ClienteSnapshot, OrdemExecucao, VeiculoSnapshot } from "../../domain/ordem-execucao";

export const INCLUIR_ITENS = { itens: { orderBy: [{ createdAt: "asc" }, { nome: "asc" }] } } satisfies Prisma.OrdemExecucaoInclude;
export type RegistroOrdemExecucao = Prisma.OrdemExecucaoGetPayload<{ include: typeof INCLUIR_ITENS }>;

export function paraOrdemExecucao(r: RegistroOrdemExecucao): OrdemExecucao {
	const { itens, cliente, veiculo, ...resto } = r;
	return {
		...resto,
		cliente: (cliente ?? null) as unknown as ClienteSnapshot | null,
		veiculo: (veiculo ?? null) as unknown as VeiculoSnapshot | null,
		itens: itens.map(({ id, tipo, referenciaId, itemOsId, nome, quantidade, tempoEstimadoMin, status, iniciadoEm, concluidoEm }) => ({
			id,
			tipo,
			referenciaId,
			itemOsId,
			nome,
			quantidade,
			tempoEstimadoMin,
			status,
			iniciadoEm,
			concluidoEm,
		})),
	};
}

export const jsonOuDbNull = (valor: object | null): Prisma.InputJsonValue | typeof Prisma.DbNull =>
	valor === null ? Prisma.DbNull : valor;
