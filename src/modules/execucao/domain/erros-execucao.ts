import { DomainError } from "../../../common/domain/domain-error";

/** O status lido sob lock não é o esperado: outra transação (mecânico, cancelamento do fluxo) mudou a ordem antes. */
export class TransicaoConcorrenteError extends DomainError {
	constructor(referencia: string) {
		super(`A ordem ${referencia} mudou de estado durante a operação; consulte a ordem e tente novamente`);
		this.name = "TransicaoConcorrenteError";
	}
}

/** O fluxo já foi cancelado pelo orquestrador (o cancelamento pode chegar antes do comando de criação). */
export class FluxoCanceladoError extends DomainError {
	constructor(
		readonly fluxoId: string,
		readonly motivo: string,
	) {
		super(`Fluxo ${fluxoId} já cancelado: ${motivo}`);
		this.name = "FluxoCanceladoError";
	}
}
