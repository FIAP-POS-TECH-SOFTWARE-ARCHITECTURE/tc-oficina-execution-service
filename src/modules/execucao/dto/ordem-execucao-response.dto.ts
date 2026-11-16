import { ApiProperty } from "@nestjs/swagger";
import type {
	ClienteSnapshot,
	EtapaExecucao,
	StatusItemExecucao,
	StatusOrdemExecucao,
	TipoItemExecucao,
	VeiculoSnapshot,
} from "../domain/ordem-execucao";

const STATUS_ORDEM: StatusOrdemExecucao[] = ["PENDENTE", "EM_ANDAMENTO", "CONCLUIDA", "REJEITADA", "INVIAVEL", "CANCELADA"];
const STATUS_ITEM: StatusItemExecucao[] = ["PENDENTE", "EM_EXECUCAO", "CONCLUIDO"];

export class ItemExecucaoResponseDto {
	@ApiProperty({ format: "uuid" })
	id!: string;

	@ApiProperty({ enum: ["SERVICO", "INSUMO"] })
	tipo!: TipoItemExecucao;

	@ApiProperty({ format: "uuid", description: "id do serviço ou insumo no catálogo do OS" })
	referenciaId!: string;

	@ApiProperty({ format: "uuid", nullable: true, type: String })
	itemOsId!: string | null;

	@ApiProperty({ example: "Troca de óleo" })
	nome!: string;

	@ApiProperty({ example: 1 })
	quantidade!: number;

	@ApiProperty({ example: 30, nullable: true, type: Number })
	tempoEstimadoMin!: number | null;

	@ApiProperty({ enum: STATUS_ITEM, nullable: true, description: "Só itens de serviço têm status" })
	status!: StatusItemExecucao | null;

	@ApiProperty({ format: "date-time", nullable: true, type: Date })
	iniciadoEm!: Date | null;

	@ApiProperty({ format: "date-time", nullable: true, type: Date })
	concluidoEm!: Date | null;
}

export class HistoricoExecucaoResponseDto {
	@ApiProperty({ format: "uuid" })
	id!: string;

	@ApiProperty({ enum: STATUS_ORDEM, nullable: true })
	statusAnterior!: StatusOrdemExecucao | null;

	@ApiProperty({ enum: STATUS_ORDEM })
	statusNovo!: StatusOrdemExecucao;

	@ApiProperty({ format: "uuid", nullable: true, type: String })
	usuarioId!: string | null;

	@ApiProperty({ nullable: true, type: String })
	observacao!: string | null;

	@ApiProperty({ format: "uuid", nullable: true, type: String, description: "messageId do evento emitido na transição" })
	messageId!: string | null;

	@ApiProperty({ format: "date-time" })
	createdAt!: Date;
}

class ClienteSnapshotResponseDto implements ClienteSnapshot {
	@ApiProperty({ format: "uuid" })
	id!: string;

	@ApiProperty({ example: "Maria Souza" })
	nome!: string;
}

class VeiculoSnapshotResponseDto implements VeiculoSnapshot {
	@ApiProperty({ format: "uuid" })
	id!: string;

	@ApiProperty({ example: "ABC1D23" })
	placa!: string;

	@ApiProperty({ example: "Volkswagen" })
	marca!: string;

	@ApiProperty({ example: "Gol" })
	modelo!: string;

	@ApiProperty({ example: 2020 })
	ano!: number;
}

export class OrdemExecucaoResponseDto {
	@ApiProperty({ format: "uuid" })
	id!: string;

	@ApiProperty({ format: "uuid" })
	osId!: string;

	@ApiProperty({ format: "uuid" })
	fluxoId!: string;

	@ApiProperty({ example: "OS-2026-000123" })
	numeroOs!: string;

	@ApiProperty({ enum: ["DIAGNOSTICO", "REPARO"] })
	etapa!: EtapaExecucao;

	@ApiProperty({ enum: STATUS_ORDEM })
	status!: StatusOrdemExecucao;

	@ApiProperty({ format: "uuid", nullable: true, type: String })
	mecanicoId!: string | null;

	@ApiProperty({ type: ClienteSnapshotResponseDto, nullable: true })
	cliente!: ClienteSnapshotResponseDto | null;

	@ApiProperty({ type: VeiculoSnapshotResponseDto, nullable: true })
	veiculo!: VeiculoSnapshotResponseDto | null;

	@ApiProperty({ nullable: true, type: String })
	observacoesAtendimento!: string | null;

	@ApiProperty({ nullable: true, type: String })
	diagnostico!: string | null;

	@ApiProperty({ nullable: true, type: String, description: "Motivo da rejeição ou da inviabilidade" })
	motivo!: string | null;

	@ApiProperty({ format: "date-time", nullable: true, type: Date })
	iniciadaEm!: Date | null;

	@ApiProperty({ format: "date-time", nullable: true, type: Date })
	finalizadaEm!: Date | null;

	@ApiProperty({ format: "date-time" })
	createdAt!: Date;

	@ApiProperty({ format: "date-time" })
	updatedAt!: Date;

	@ApiProperty({ type: [ItemExecucaoResponseDto] })
	itens!: ItemExecucaoResponseDto[];

	@ApiProperty({ type: [HistoricoExecucaoResponseDto], required: false, description: "Só no detalhe da ordem" })
	historico?: HistoricoExecucaoResponseDto[];
}

export class ServicoCatalogoResponseDto {
	@ApiProperty({ format: "uuid" })
	id!: string;

	@ApiProperty({ example: "Troca de óleo" })
	nome!: string;

	@ApiProperty({ nullable: true, type: String })
	descricao!: string | null;

	@ApiProperty({ example: 12000, description: "Preço em centavos" })
	precoCentavos!: number;

	@ApiProperty({ example: 30 })
	tempoEstimadoMin!: number;
}

export class InsumoCatalogoResponseDto {
	@ApiProperty({ format: "uuid" })
	id!: string;

	@ApiProperty({ example: "OLEO-5W30" })
	codigo!: string;

	@ApiProperty({ example: "Óleo 5W30" })
	nome!: string;

	@ApiProperty({ example: 4500, description: "Preço em centavos" })
	precoCentavos!: number;

	@ApiProperty({ example: 20 })
	quantidadeEstoque!: number;
}
