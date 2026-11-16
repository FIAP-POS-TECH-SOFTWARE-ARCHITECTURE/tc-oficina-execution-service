import { ApiProperty } from "@nestjs/swagger";
import { IsString, MaxLength, MinLength } from "class-validator";

export class MotivoDto {
	@ApiProperty({ example: "Peça fora de linha no fabricante" })
	@IsString()
	@MinLength(1)
	@MaxLength(2000)
	motivo!: string;
}
