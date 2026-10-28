import { criarEnvelope, EnvelopeMensagem } from "../../mensageria/envelope";

export type TipoEventoExecucao =
	| "ExecucaoEnfileirada"
	| "DiagnosticoIniciado"
	| "DiagnosticoConcluido"
	| "DiagnosticoRejeitado"
	| "ReparoIniciado"
	| "ReparoConcluido"
	| "ReparoInviavel"
	| "ExecucaoCancelada";

export interface ReferenciaFluxo {
	fluxoId: string;
	osId: string;
	numeroOs: string;
}

export function criarEventoExecucao<T>(
	ref: ReferenciaFluxo,
	tipo: TipoEventoExecucao,
	payload: T,
	correlationId: string,
): EnvelopeMensagem<T> {
	return criarEnvelope({
		tipo,
		origem: "execution",
		fluxoId: ref.fluxoId,
		osId: ref.osId,
		numeroOs: ref.numeroOs,
		correlationId,
		payload,
	});
}
