import { ApiProperty } from "@nestjs/swagger";
import { IsIn } from "class-validator";
import { ETAPAS_EXECUCAO, type EtapaExecucao } from "../domain/ordem-execucao";

export class ListarFilaDto {
	@ApiProperty({ enum: ETAPAS_EXECUCAO })
	@IsIn(ETAPAS_EXECUCAO)
	etapa!: EtapaExecucao;
}
