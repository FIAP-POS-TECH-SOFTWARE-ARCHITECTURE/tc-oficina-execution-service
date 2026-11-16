import { UnauthorizedException, createParamDecorator, ExecutionContext } from "@nestjs/common";

export interface AuthenticatedCliente {
	id: string;
	cpf: string;
	nome: string;
}

export const CurrentCliente = createParamDecorator((_: unknown, ctx: ExecutionContext): AuthenticatedCliente => {
	const req = ctx.switchToHttp().getRequest<{ cliente: AuthenticatedCliente }>();
	if (!req.cliente) throw new UnauthorizedException("Cliente não autenticado");
	return req.cliente;
});
