import { HttpResponse, IServiceResponse } from "semantic-response";

type HttpErrorArg = Parameters<typeof HttpResponse.badRequest>[0];

export const SR = {
	ok: <T>(data: T, message?: string) => HttpResponse.ok<T>(data, message),
	created: <T>(data: T, message?: string) => HttpResponse.created<T>(data, message),
	noContent: <T = unknown>(message?: string) => HttpResponse.noContent(message) as unknown as IServiceResponse<T>,
	badRequest: <T = unknown>(error?: HttpErrorArg, message?: string) =>
		HttpResponse.badRequest(error, message) as unknown as IServiceResponse<T>,
	unauthorized: <T = unknown>(error?: HttpErrorArg, message?: string) =>
		HttpResponse.unauthorized(error, message) as unknown as IServiceResponse<T>,
	forbidden: <T = unknown>(error?: HttpErrorArg, message?: string) =>
		HttpResponse.forbidden(error, message) as unknown as IServiceResponse<T>,
	notFound: <T = unknown>(error?: HttpErrorArg, message?: string) =>
		HttpResponse.notFound(error, message) as unknown as IServiceResponse<T>,
	conflict: <T = unknown>(error?: HttpErrorArg, message?: string) =>
		HttpResponse.conflict(error, message) as unknown as IServiceResponse<T>,
	unprocessableEntity: <T = unknown>(error?: HttpErrorArg, message?: string) =>
		HttpResponse.unprocessableEntity(error, message) as unknown as IServiceResponse<T>,
	internalServerError: <T = unknown>(error?: HttpErrorArg, message?: string) =>
		HttpResponse.internalServerError(error, message) as unknown as IServiceResponse<T>,
};
