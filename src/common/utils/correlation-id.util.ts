import { randomUUID } from "node:crypto";

/** requestId HTTP (atribuído pelo pino-http a partir do x-request-id do gateway) que origina a cadeia de mensagens. */
export function correlationIdDaRequisicao(req: { id?: unknown; headers?: Record<string, unknown> }): string {
	if (typeof req.id === "string" && req.id.length > 0) return req.id;
	const header = req.headers?.["x-request-id"];
	if (typeof header === "string" && header.length > 0) return header.split(",")[0].trim();
	return randomUUID();
}
