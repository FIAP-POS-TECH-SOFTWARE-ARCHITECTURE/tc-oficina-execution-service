import { Inject, Injectable } from "@nestjs/common";
import type { IServiceResponse } from "semantic-response";
import { SR } from "../../../../common/utils/service-response.util";
import { TransicaoConcorrenteError } from "../../domain/erros-execucao";
import { ORDENS_EXECUCAO_GATEWAY, type OrdensExecucaoGatewayPort } from "../ports/ordens-execucao.gateway";
import { ExecutorAcaoOrdem, UsuarioAcao } from "../services/executor-acao-ordem";

export type OperacaoItem = "INICIAR" | "CONCLUIR";

const REGRAS = {
	INICIAR: { de: "PENDENTE", para: "EM_EXECUCAO", erro: "Serviço só pode ser iniciado quando pendente", verbo: "iniciado" },
	CONCLUIR: {
		de: "EM_EXECUCAO",
		para: "CONCLUIDO",
		erro: "Serviço só pode ser concluído quando em execução",
		verbo: "concluído",
	},
} as const;

@Injectable()
export class AtualizarItemReparoUseCase {
	constructor(
		private readonly executor: ExecutorAcaoOrdem,
		@Inject(ORDENS_EXECUCAO_GATEWAY) private readonly gateway: OrdensExecucaoGatewayPort,
	) {}

	async execute(ordemId: string, itemId: string, operacao: OperacaoItem, usuario: UsuarioAcao): Promise<IServiceResponse<unknown>> {
		const carga = await this.executor.carregarParaAcao(ordemId, usuario, "CONCLUIR_REPARO");
		if ("erro" in carga) return carga.erro;
		const item = carga.ordem.itens.find((i) => i.id === itemId && i.tipo === "SERVICO");
		if (!item) return SR.notFound(undefined, "Item de serviço não encontrado nesta ordem");
		const regra = REGRAS[operacao];
		if (item.status !== regra.de) return SR.unprocessableEntity(undefined, regra.erro);
		try {
			const ordem = await this.gateway.atualizarItem({
				ordemId,
				itemId,
				de: regra.de,
				para: regra.para,
				em: new Date(),
				usuarioId: usuario.id,
				observacao: `Serviço ${item.nome} ${regra.verbo}`,
			});
			return SR.ok(ordem);
		} catch (erro) {
			if (erro instanceof TransicaoConcorrenteError) return SR.unprocessableEntity(undefined, erro.message);
			throw erro;
		}
	}
}
