import { Injectable } from "@nestjs/common";
import type { IServiceResponse } from "semantic-response";
import { criarEventoExecucao } from "../eventos-execucao";
import { ExecutorAcaoOrdem, UsuarioAcao } from "../services/executor-acao-ordem";

@Injectable()
export class ConcluirReparoUseCase {
	constructor(private readonly executor: ExecutorAcaoOrdem) {}

	async execute(ordemId: string, usuario: UsuarioAcao, correlationId: string): Promise<IServiceResponse<unknown>> {
		const carga = await this.executor.carregarParaAcao(ordemId, usuario, "CONCLUIR_REPARO");
		if ("erro" in carga) return carga.erro;
		const agora = new Date();
		return this.executor.aplicar(carga.ordem, usuario, "CONCLUIR_REPARO", {
			observacao: "Reparo concluído",
			dados: { finalizadaEm: agora },
			concluirItensServicoEm: agora,
			eventos: [
				criarEventoExecucao(
					carga.ordem,
					"ReparoConcluido",
					{ mecanicoId: usuario.id, concluidoEm: agora.toISOString() },
					correlationId,
				),
			],
		});
	}
}
