export const CATALOGO_OS = Symbol("CATALOGO_OS");

export interface ServicoCatalogo {
	id: string;
	nome: string;
	descricao: string | null;
	precoCentavos: number;
	tempoEstimadoMin: number;
}

export interface InsumoCatalogo {
	id: string;
	codigo: string;
	nome: string;
	precoCentavos: number;
	quantidadeEstoque: number;
}

export interface OpcoesConsultaCatalogo {
	ignorarCache?: boolean;
}

export interface CatalogoOsPort {
	listarServicos(opcoes?: OpcoesConsultaCatalogo): Promise<ServicoCatalogo[]>;
	listarInsumos(opcoes?: OpcoesConsultaCatalogo): Promise<InsumoCatalogo[]>;
}
