import { Inject, Injectable } from "@nestjs/common";
import type { IServiceResponse } from "semantic-response";
import { SR } from "../../../../common/utils/service-response.util";
import type { TipoItemExecucao } from "../../domain/ordem-execucao";
import { criarEventoExecucao } from "../eventos-execucao";
import { CATALOGO_OS, type CatalogoOsPort, type InsumoCatalogo, type ServicoCatalogo } from "../ports/catalogo-os.port";
import { ExecutorAcaoOrdem, UsuarioAcao } from "../services/executor-acao-ordem";

export interface EntradaDiagnostico {
	diagnostico: string;
	itens: { tipo: TipoItemExecucao; referenciaId: string; quantidade: number }[];
}

type ItemEntrada = EntradaDiagnostico["itens"][number];
type Referencia = { nome: string; tempoEstimadoMin: number | null };
type Referencias = Map<string, Referencia>;
const chave = (i: Pick<ItemEntrada, "tipo" | "referenciaId">) => `${i.tipo} ${i.referenciaId}`;

@Injectable()
export class RegistrarDiagnosticoUseCase {
	constructor(
		private readonly executor: ExecutorAcaoOrdem,
		@Inject(CATALOGO_OS) private readonly catalogo: CatalogoOsPort,
	) {}

	async execute(
		ordemId: string,
		entrada: EntradaDiagnostico,
		usuario: UsuarioAcao,
		correlationId: string,
	): Promise<IServiceResponse<unknown>> {
		const carga = await this.executor.carregarParaAcao(ordemId, usuario, "CONCLUIR_DIAGNOSTICO");
		if ("erro" in carga) return carga.erro;

		const chaves = entrada.itens.map(chave);
		const repetidos = [...new Set(chaves.filter((c, i) => chaves.indexOf(c) !== i))];
		if (repetidos.length) return SR.unprocessableEntity(undefined, `Item repetido no diagnóstico: ${repetidos.join(", ")}`);

		const referencias = await this.resolverNoCatalogo(entrada.itens);
		const fora = chaves.filter((c) => !referencias.has(c));
		if (fora.length) return SR.unprocessableEntity(undefined, `Itens fora do catálogo ativo do OS: ${fora.join(", ")}`);

		const { ordem } = carga;
		return this.executor.aplicar(ordem, usuario, "CONCLUIR_DIAGNOSTICO", {
			observacao: "Diagnóstico registrado",
			dados: { diagnostico: entrada.diagnostico, finalizadaEm: new Date() },
			itensNovos: entrada.itens.map((i) => ({
				tipo: i.tipo,
				referenciaId: i.referenciaId,
				itemOsId: null,
				quantidade: i.quantidade,
				status: null,
				...referencias.get(chave(i))!,
			})),
			eventos: [
				criarEventoExecucao(
					ordem,
					"DiagnosticoConcluido",
					{
						mecanicoId: usuario.id,
						diagnostico: entrada.diagnostico,
						itens: entrada.itens.map(({ tipo, referenciaId, quantidade }) => ({ tipo, referenciaId, quantidade })),
					},
					correlationId,
				),
			],
		});
	}

	/** Consulta síncrona ao OS; item ausente no cache força uma revalidação antes de recusar. */
	private async resolverNoCatalogo(itens: ItemEntrada[]): Promise<Referencias> {
		const buscar = async (ignorarCache: boolean): Promise<Referencias> => {
			const opcoes = ignorarCache ? { ignorarCache } : undefined;
			const [servicos, insumos] = await Promise.all([
				itens.some((i) => i.tipo === "SERVICO") ? this.catalogo.listarServicos(opcoes) : ([] as ServicoCatalogo[]),
				itens.some((i) => i.tipo === "INSUMO") ? this.catalogo.listarInsumos(opcoes) : ([] as InsumoCatalogo[]),
			]);
			return new Map<string, Referencia>([
				...servicos.map(
					(s) => [chave({ tipo: "SERVICO", referenciaId: s.id }), { nome: s.nome, tempoEstimadoMin: s.tempoEstimadoMin }] as const,
				),
				...insumos.map((i) => [chave({ tipo: "INSUMO", referenciaId: i.id }), { nome: i.nome, tempoEstimadoMin: null }] as const),
			]);
		};
		const doCache = await buscar(false);
		return itens.every((i) => doCache.has(chave(i))) ? doCache : buscar(true);
	}
}
