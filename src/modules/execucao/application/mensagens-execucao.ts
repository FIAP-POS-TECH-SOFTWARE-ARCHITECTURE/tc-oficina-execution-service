// Payloads dos comandos recebidos (contrato §3.1)
import type { ClienteSnapshot, VeiculoSnapshot } from "../domain/ordem-execucao";

export interface SolicitarDiagnosticoPayload {
	cliente: ClienteSnapshot;
	veiculo: VeiculoSnapshot;
	observacoesAtendimento: string | null;
}

export interface IniciarReparoPayload {
	itensServico: { itemId: string; servicoId: string; nome: string; quantidade: number; tempoEstimadoMin: number }[];
	itensInsumo: { insumoId: string; nome: string; quantidade: number }[];
}

export interface CancelarExecucaoPayload {
	motivo: string;
}
