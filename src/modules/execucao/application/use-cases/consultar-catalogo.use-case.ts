import { Inject, Injectable } from "@nestjs/common";
import type { IServiceResponse } from "semantic-response";
import { SR } from "../../../../common/utils/service-response.util";
import { CATALOGO_OS, type CatalogoOsPort } from "../ports/catalogo-os.port";

@Injectable()
export class ConsultarCatalogoUseCase {
	constructor(@Inject(CATALOGO_OS) private readonly catalogo: CatalogoOsPort) {}

	async servicos(): Promise<IServiceResponse<unknown>> {
		return SR.ok(await this.catalogo.listarServicos());
	}

	async insumos(): Promise<IServiceResponse<unknown>> {
		return SR.ok(await this.catalogo.listarInsumos());
	}
}
