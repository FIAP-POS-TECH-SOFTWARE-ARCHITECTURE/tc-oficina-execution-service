import { Injectable } from "@nestjs/common";
import type { IServiceResponse } from "semantic-response";
import { criarEventoExecucao } from "../eventos-execucao";
import { ExecutorAcaoOrdem, UsuarioAcao } from "../services/executor-acao-ordem";

@Injectable()
export class RejeitarDiagnosticoUseCase {
	constructor(private readonly executor: ExecutorAcaoOrdem) {}

	async execute(ordemId: string, motivo: string, usuario: UsuarioAcao, correlationId: string): Promise<IServiceResponse<unknown>> {
		const carga = await this.executor.carregarParaAcao(ordemId, usuario, "REJEITAR_DIAGNOSTICO");
		if ("erro" in carga) return carga.erro;
		return this.executor.aplicar(carga.ordem, usuario, "REJEITAR_DIAGNOSTICO", {
			observacao: `Sem reparo possível: ${motivo}`,
			dados: { motivo, finalizadaEm: new Date() },
			eventos: [criarEventoExecucao(carga.ordem, "DiagnosticoRejeitado", { mecanicoId: usuario.id, motivo }, correlationId)],
		});
	}
}
