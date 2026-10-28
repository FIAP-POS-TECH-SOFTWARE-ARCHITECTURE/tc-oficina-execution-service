import { BadRequestException, Injectable, PipeTransform } from "@nestjs/common";
import { ETAPAS_EXECUCAO, EtapaExecucao } from "../domain/ordem-execucao";

@Injectable()
export class ParseEtapaPipe implements PipeTransform<string, EtapaExecucao> {
	transform(valor: string): EtapaExecucao {
		const etapa = String(valor ?? "").toUpperCase();
		if (!(ETAPAS_EXECUCAO as readonly string[]).includes(etapa)) throw new BadRequestException("etapa deve ser DIAGNOSTICO ou REPARO");
		return etapa as EtapaExecucao;
	}
}
