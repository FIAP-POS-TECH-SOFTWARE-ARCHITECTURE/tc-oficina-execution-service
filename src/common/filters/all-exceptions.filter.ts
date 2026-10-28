import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus, Logger } from "@nestjs/common";
import { Response } from "express";
import { HttpResponse, IServiceResponse } from "semantic-response";

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
	private readonly logger = new Logger(AllExceptionsFilter.name);

	catch(exception: unknown, host: ArgumentsHost) {
		const ctx = host.switchToHttp();
		const res = ctx.getResponse<Response>();

		let body: IServiceResponse<unknown, unknown>;

		if (exception instanceof HttpException) {
			const status = exception.getStatus();
			const responseBody = exception.getResponse();
			const message = this.getMessage(responseBody, exception.message);
			const errorData = typeof responseBody === "object" && responseBody !== null ? responseBody : undefined;
			body = {
				status,
				success: false,
				message,
				error: {
					message,
					data: errorData,
				},
			};
		} else {
			this.logger.error(exception instanceof Error ? exception.stack : String(exception));
			body = HttpResponse.internalServerError(
				{
					message: exception instanceof Error ? exception.message : "Erro interno",
				},
				"Erro interno do servidor",
			);
		}

		res.status(body.status ?? HttpStatus.INTERNAL_SERVER_ERROR).json(body);
	}

	private getMessage(responseBody: unknown, fallback: string): string {
		if (typeof responseBody === "string") return responseBody;
		if (typeof responseBody !== "object" || responseBody === null) return fallback;
		if (!("message" in responseBody)) return fallback;

		const message = (responseBody as { message?: unknown }).message;
		if (Array.isArray(message)) return message.map(String).join("; ");
		return typeof message === "string" ? message : fallback;
	}
}
