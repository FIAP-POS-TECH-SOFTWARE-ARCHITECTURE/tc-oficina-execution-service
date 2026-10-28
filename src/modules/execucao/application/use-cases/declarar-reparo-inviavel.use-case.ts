import { Injectable } from "@nestjs/common";
import type { IServiceResponse } from "semantic-response";
import { criarEventoExecucao } from "../eventos-execucao";
import { ExecutorAcaoOrdem, UsuarioAcao } from "../services/executor-acao-ordem";

@Injectable()
export class DeclararReparoInviavelUseCase {
	constructor(private readonly executor: ExecutorAcaoOrdem) {}

	async execute(ordemId: string, motivo: string, usuario: UsuarioAcao, correlationId: string): Promise<IServiceResponse<unknown>> {
		const carga = await this.executor.carregarParaAcao(ordemId, usuario, "DECLARAR_INVIAVEL");
		if ("erro" in carga) return carga.erro;
		return this.executor.aplicar(carga.ordem, usuario, "DECLARAR_INVIAVEL", {
			observacao: `Reparo inviável: ${motivo}`,
			dados: { motivo, finalizadaEm: new Date() },
			eventos: [criarEventoExecucao(carga.ordem, "ReparoInviavel", { mecanicoId: usuario.id, motivo }, correlationId)],
		});
	}
}
