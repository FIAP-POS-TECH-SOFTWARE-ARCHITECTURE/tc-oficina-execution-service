import { Inject, Injectable, Logger } from "@nestjs/common";
import type { IServiceResponse } from "semantic-response";
import type { AuthenticatedUser } from "../../../../common/decorators/current-user.decorator";
import { Role } from "../../../../common/enums/role.enum";
import { SR } from "../../../../common/utils/service-response.util";
import type { EnvelopeMensagem } from "../../../mensageria/envelope";
import { TransicaoConcorrenteError } from "../../domain/erros-execucao";
import type { OrdemExecucao } from "../../domain/ordem-execucao";
import { AcaoOrdemExecucao, destinoDaTransicao, statusDeOrigem } from "../../domain/transicoes-ordem-execucao";
import {
	DadosTransicao,
	NovoItemExecucao,
	ORDENS_EXECUCAO_GATEWAY,
	type OrdensExecucaoGatewayPort,
} from "../ports/ordens-execucao.gateway";

export type UsuarioAcao = Pick<AuthenticatedUser, "id" | "role">;

export interface PlanoAcao {
	observacao: string;
	dados?: DadosTransicao;
	itensNovos?: NovoItemExecucao[];
	concluirItensServicoEm?: Date;
	eventos: EnvelopeMensagem<unknown>[];
}

/** Regras comuns a toda ação do mecânico sobre uma ordem (dono, cancelamento, máquina de estados, corrida). */
@Injectable()
export class ExecutorAcaoOrdem {
	private readonly logger = new Logger(ExecutorAcaoOrdem.name);

	constructor(@Inject(ORDENS_EXECUCAO_GATEWAY) private readonly gateway: OrdensExecucaoGatewayPort) {}

	async carregarParaAcao(
		ordemId: string,
		usuario: UsuarioAcao,
		acao: AcaoOrdemExecucao,
	): Promise<{ ordem: OrdemExecucao } | { erro: IServiceResponse<unknown> }> {
		const ordem = await this.gateway.buscarPorId(ordemId);
		if (!ordem) return { erro: SR.notFound(undefined, "Ordem de execução não encontrada") };
		if (usuario.role !== Role.ADMINISTRADOR && ordem.mecanicoId !== usuario.id)
			return { erro: SR.forbidden(undefined, "Só o mecânico que pegou a ordem (ou um administrador) pode agir nela") };
		if (ordem.status === "CANCELADA")
			return { erro: SR.unprocessableEntity(undefined, "Ordem cancelada pelo fluxo da OS; nenhuma ação é aceita") };
		if (!destinoDaTransicao(ordem.etapa, ordem.status, acao))
			return {
				erro: SR.unprocessableEntity(undefined, `Ação ${acao} inválida para ordem de ${ordem.etapa} em ${ordem.status}`),
			};
		return { ordem };
	}

	async aplicar(
		ordem: OrdemExecucao,
		usuario: UsuarioAcao,
		acao: AcaoOrdemExecucao,
		plano: PlanoAcao,
	): Promise<IServiceResponse<unknown>> {
		try {
			const atualizada = await this.gateway.transicionar({
				ordemId: ordem.id,
				de: statusDeOrigem(acao),
				para: destinoDaTransicao(ordem.etapa, ordem.status, acao)!,
				usuarioId: usuario.id,
				...plano,
			});
			this.logger.log({
				event: "execucao.ordem.transicao",
				acao,
				fluxoId: ordem.fluxoId,
				osId: ordem.osId,
				ordemExecucaoId: ordem.id,
				messageId: plano.eventos[0]?.messageId,
				status: atualizada.status,
			});
			return SR.ok(atualizada);
		} catch (erro) {
			if (erro instanceof TransicaoConcorrenteError) return SR.unprocessableEntity(undefined, erro.message);
			throw erro;
		}
	}
}
