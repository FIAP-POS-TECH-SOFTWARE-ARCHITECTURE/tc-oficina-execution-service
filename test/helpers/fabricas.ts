import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { EnvelopeMensagem } from "../../src/modules/mensageria/envelope";

/** Exemplo do contrato com ids novos (cada teste conta uma OS diferente). */
export function comando<T>(
	tipo: "SolicitarDiagnostico" | "IniciarReparo" | "CancelarExecucao",
	s: Partial<EnvelopeMensagem<T>> = {},
): EnvelopeMensagem<T> {
	const exemplo = JSON.parse(
		readFileSync(join(process.cwd(), "contratos", "exemplos", `${tipo}.json`), "utf8"),
	) as EnvelopeMensagem<T>;
	return { ...exemplo, messageId: randomUUID(), fluxoId: randomUUID(), osId: randomUUID(), ...s };
}
