import { ServiceUnavailableException } from "@nestjs/common";
import { mensagemDeErro } from "../../../../common/utils/erro.util";
import type {
	CatalogoOsPort,
	InsumoCatalogo,
	OpcoesConsultaCatalogo,
	ServicoCatalogo,
} from "../../application/ports/catalogo-os.port";

interface ConfiguracaoCatalogoOs {
	baseUrl: string;
	apiKey: string;
	timeoutMs?: number;
	ttlMs?: number;
	agora?: () => number;
	fetchFn?: typeof fetch;
}

export function extrairLista(corpo: unknown): unknown[] | null {
	if (Array.isArray(corpo)) return corpo as unknown[];
	const data = (corpo as { data?: unknown } | null)?.data;
	return Array.isArray(data) ? data : null;
}

/** Consulta síncrona ao catálogo do OS: o ponto REST entre serviços no fluxo do mecânico. */
export class CatalogoOsHttpGateway implements CatalogoOsPort {
	private readonly cache = new Map<string, { valor: unknown[]; expiraEm: number }>();
	private readonly timeoutMs: number;
	private readonly ttlMs: number;
	private readonly agora: () => number;
	private readonly fetchFn: typeof fetch;

	constructor(private readonly cfg: ConfiguracaoCatalogoOs) {
		this.timeoutMs = cfg.timeoutMs ?? 3000;
		this.ttlMs = cfg.ttlMs ?? 60_000;
		this.agora = cfg.agora ?? Date.now;
		this.fetchFn = cfg.fetchFn ?? fetch;
	}

	listarServicos(opcoes?: OpcoesConsultaCatalogo): Promise<ServicoCatalogo[]> {
		return this.consultar<ServicoCatalogo>("/internal/catalogo/servicos", opcoes);
	}

	listarInsumos(opcoes?: OpcoesConsultaCatalogo): Promise<InsumoCatalogo[]> {
		return this.consultar<InsumoCatalogo>("/internal/catalogo/insumos", opcoes);
	}

	private async consultar<T>(caminho: string, opcoes: OpcoesConsultaCatalogo = {}): Promise<T[]> {
		const agora = this.agora();
		const emCache = this.cache.get(caminho);
		if (!opcoes.ignorarCache && emCache && emCache.expiraEm > agora) return emCache.valor as T[];

		let resposta: Response;
		try {
			resposta = await this.fetchFn(`${this.cfg.baseUrl.replace(/\/+$/, "")}${caminho}`, {
				headers: { "x-internal-api-key": this.cfg.apiKey, accept: "application/json" },
				signal: AbortSignal.timeout(this.timeoutMs),
			});
		} catch (erro) {
			const motivo =
				erro instanceof Error && erro.name === "TimeoutError" ? `sem resposta em ${this.timeoutMs}ms` : mensagemDeErro(erro);
			throw new ServiceUnavailableException(`Catálogo do OS indisponível (${motivo}). Tente novamente em instantes.`);
		}
		if (resposta.status === 401)
			throw new ServiceUnavailableException("Catálogo do OS recusou a chave interna (HTTP 401); verifique INTERNAL_API_KEY.");
		if (!resposta.ok)
			throw new ServiceUnavailableException(`Catálogo do OS indisponível (HTTP ${resposta.status}). Tente novamente em instantes.`);

		const lista = extrairLista(await resposta.json().catch(() => undefined));
		if (!lista) throw new ServiceUnavailableException("Catálogo do OS respondeu em formato inesperado.");
		this.cache.set(caminho, { valor: lista, expiraEm: agora + this.ttlMs });
		return lista as T[];
	}
}
