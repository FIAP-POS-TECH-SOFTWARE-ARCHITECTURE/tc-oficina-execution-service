import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Post, Query, Req } from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import type { Request } from "express";
import { ApiEnvelopedResponse } from "../../../common/decorators/api-enveloped-response.decorator";
import { CurrentUser, type AuthenticatedUser } from "../../../common/decorators/current-user.decorator";
import { Roles } from "../../../common/decorators/roles.decorator";
import { Role } from "../../../common/enums/role.enum";
import { correlationIdDaRequisicao } from "../../../common/utils/correlation-id.util";
import { BuscarOrdemUseCase } from "../application/use-cases/buscar-ordem.use-case";
import { ConcluirReparoUseCase } from "../application/use-cases/concluir-reparo.use-case";
import { ConsultarCatalogoUseCase } from "../application/use-cases/consultar-catalogo.use-case";
import { DeclararReparoInviavelUseCase } from "../application/use-cases/declarar-reparo-inviavel.use-case";
import { ListarFilaUseCase } from "../application/use-cases/listar-fila.use-case";
import { PegarProximaOrdemUseCase } from "../application/use-cases/pegar-proxima-ordem.use-case";
import { RegistrarDiagnosticoUseCase } from "../application/use-cases/registrar-diagnostico.use-case";
import { RejeitarDiagnosticoUseCase } from "../application/use-cases/rejeitar-diagnostico.use-case";
import type { EtapaExecucao } from "../domain/ordem-execucao";
import { ListarFilaDto } from "../dto/listar-fila.dto";
import { MotivoDto } from "../dto/motivo.dto";
import { InsumoCatalogoResponseDto, OrdemExecucaoResponseDto, ServicoCatalogoResponseDto } from "../dto/ordem-execucao-response.dto";
import { RegistrarDiagnosticoDto } from "../dto/registrar-diagnostico.dto";
import { ParseEtapaPipe } from "./parse-etapa.pipe";

const ID = new ParseUUIDPipe();

@ApiTags("Execução")
@ApiBearerAuth()
@Roles(Role.MECANICO, Role.ADMINISTRADOR)
@Controller("execucao")
export class ExecucaoController {
	constructor(
		private readonly listarFila: ListarFilaUseCase,
		private readonly pegarProxima: PegarProximaOrdemUseCase,
		private readonly buscarOrdem: BuscarOrdemUseCase,
		private readonly registrarDiagnostico: RegistrarDiagnosticoUseCase,
		private readonly rejeitarDiagnostico: RejeitarDiagnosticoUseCase,
		private readonly concluirReparo: ConcluirReparoUseCase,
		private readonly declararInviavel: DeclararReparoInviavelUseCase,
		private readonly catalogo: ConsultarCatalogoUseCase,
	) {}

	@Get("fila")
	@ApiOperation({ summary: "Ordens pendentes da etapa, em ordem de chegada" })
	@ApiEnvelopedResponse(OrdemExecucaoResponseDto, { isArray: true })
	fila(@Query() q: ListarFilaDto) {
		return this.listarFila.execute(q.etapa);
	}

	@Post("fila/:etapa/proxima")
	@HttpCode(200)
	@ApiOperation({ summary: "Reserva a próxima ordem da etapa para o mecânico do token (404 se a fila estiver vazia)" })
	@ApiEnvelopedResponse(OrdemExecucaoResponseDto)
	proxima(@Param("etapa", ParseEtapaPipe) etapa: EtapaExecucao, @CurrentUser() usuario: AuthenticatedUser, @Req() req: Request) {
		return this.pegarProxima.execute(etapa, usuario, correlationIdDaRequisicao(req));
	}

	@Get("ordens/:ordemExecucaoId")
	@ApiOperation({ summary: "Detalhe da ordem com itens e histórico" })
	@ApiEnvelopedResponse(OrdemExecucaoResponseDto)
	detalhe(@Param("ordemExecucaoId", ID) id: string) {
		return this.buscarOrdem.execute(id);
	}

	@Post("ordens/:ordemExecucaoId/diagnostico")
	@HttpCode(200)
	@ApiOperation({
		summary: "Registra o diagnóstico; itens validados no catálogo do OS (422 fora do catálogo, 503 OS indisponível)",
	})
	@ApiEnvelopedResponse(OrdemExecucaoResponseDto)
	diagnostico(
		@Param("ordemExecucaoId", ID) id: string,
		@Body() dto: RegistrarDiagnosticoDto,
		@CurrentUser() usuario: AuthenticatedUser,
		@Req() req: Request,
	) {
		return this.registrarDiagnostico.execute(id, dto, usuario, correlationIdDaRequisicao(req));
	}

	@Post("ordens/:ordemExecucaoId/diagnostico/rejeitar")
	@HttpCode(200)
	@ApiOperation({ summary: "Declara que não há reparo possível (cancela a OS pelo fluxo)" })
	@ApiEnvelopedResponse(OrdemExecucaoResponseDto)
	rejeitar(
		@Param("ordemExecucaoId", ID) id: string,
		@Body() dto: MotivoDto,
		@CurrentUser() usuario: AuthenticatedUser,
		@Req() req: Request,
	) {
		return this.rejeitarDiagnostico.execute(id, dto.motivo, usuario, correlationIdDaRequisicao(req));
	}

	@Post("ordens/:ordemExecucaoId/reparo/concluir")
	@HttpCode(200)
	@ApiOperation({ summary: "Conclui o reparo (e os serviços ainda não concluídos)" })
	@ApiEnvelopedResponse(OrdemExecucaoResponseDto)
	concluir(@Param("ordemExecucaoId", ID) id: string, @CurrentUser() usuario: AuthenticatedUser, @Req() req: Request) {
		return this.concluirReparo.execute(id, usuario, correlationIdDaRequisicao(req));
	}

	@Post("ordens/:ordemExecucaoId/reparo/inviavel")
	@HttpCode(200)
	@ApiOperation({ summary: "Declara o reparo inviável: dispara estorno do pagamento, cancelamento do orçamento e da OS" })
	@ApiEnvelopedResponse(OrdemExecucaoResponseDto)
	inviavel(
		@Param("ordemExecucaoId", ID) id: string,
		@Body() dto: MotivoDto,
		@CurrentUser() usuario: AuthenticatedUser,
		@Req() req: Request,
	) {
		return this.declararInviavel.execute(id, dto.motivo, usuario, correlationIdDaRequisicao(req));
	}

	@Get("catalogo/servicos")
	@ApiOperation({ summary: "Serviços ativos do catálogo do OS (consulta síncrona)" })
	@ApiEnvelopedResponse(ServicoCatalogoResponseDto, { isArray: true })
	servicos() {
		return this.catalogo.servicos();
	}

	@Get("catalogo/insumos")
	@ApiOperation({ summary: "Insumos ativos do catálogo do OS (consulta síncrona)" })
	@ApiEnvelopedResponse(InsumoCatalogoResponseDto, { isArray: true })
	insumos() {
		return this.catalogo.insumos();
	}
}
