import { ApiProperty } from "@nestjs/swagger";
import { Type } from "class-transformer";
import { ArrayMinSize, IsIn, IsInt, IsString, IsUUID, MaxLength, Min, MinLength, ValidateNested } from "class-validator";

export class ItemDiagnosticoDto {
	@ApiProperty({ enum: ["SERVICO", "INSUMO"] })
	@IsIn(["SERVICO", "INSUMO"])
	tipo!: "SERVICO" | "INSUMO";

	@ApiProperty({ format: "uuid", description: "id do serviço ou insumo no catálogo do OS (GET /execucao/catalogo/*)" })
	@IsUUID()
	referenciaId!: string;

	@ApiProperty({ minimum: 1 })
	@IsInt()
	@Min(1)
	quantidade!: number;
}

export class RegistrarDiagnosticoDto {
	@ApiProperty({ example: "Vazamento na junta do cárter; trocar óleo e filtro." })
	@IsString()
	@MinLength(1)
	@MaxLength(2000)
	diagnostico!: string;

	@ApiProperty({ type: [ItemDiagnosticoDto] })
	@ValidateNested({ each: true })
	@ArrayMinSize(1)
	@Type(() => ItemDiagnosticoDto)
	itens!: ItemDiagnosticoDto[];
}
