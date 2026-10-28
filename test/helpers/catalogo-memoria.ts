import type { CatalogoOsPort, InsumoCatalogo, ServicoCatalogo } from "../../src/modules/execucao/application/ports/catalogo-os.port";

export class CatalogoMemoria implements CatalogoOsPort {
	servicos: ServicoCatalogo[] = [];
	insumos: InsumoCatalogo[] = [];

	limpar(): void {
		this.servicos = [];
		this.insumos = [];
	}

	listarServicos(): Promise<ServicoCatalogo[]> {
		return Promise.resolve(this.servicos);
	}

	listarInsumos(): Promise<InsumoCatalogo[]> {
		return Promise.resolve(this.insumos);
	}
}
