import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { JwtService } from "@nestjs/jwt";
import { Request } from "express";
import { IS_CLIENTE_AUTH_KEY } from "../decorators/cliente-auth.decorator";
import type { AuthenticatedCliente } from "../decorators/current-cliente.decorator";
import type { AuthenticatedUser } from "../decorators/current-user.decorator";
import { IS_PUBLIC_KEY } from "../decorators/public.decorator";
import { Role } from "../enums/role.enum";

interface JwtPayload {
	sub?: string;
	email?: string;
	role?: string;
	type?: string;
	cpf?: string;
	nome?: string;
}

type RequestAutenticado = Request & { user?: AuthenticatedUser; cliente?: AuthenticatedCliente };

const ROLES_VALIDAS = new Set<string>(Object.values(Role));

/**
 * O execution não tem tabela de usuários nem de clientes: valida só assinatura, expiração e claims.
 * Usuário inativado mantém acesso até o token expirar (trade-off registrado no contrato).
 */
@Injectable()
export class JwtAuthGuard implements CanActivate {
	constructor(
		private readonly jwt: JwtService,
		private readonly reflector: Reflector,
	) {}

	async canActivate(ctx: ExecutionContext): Promise<boolean> {
		const alvos = [ctx.getHandler(), ctx.getClass()];
		if (this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, alvos)) return true;
		const rotaDeCliente = this.reflector.getAllAndOverride<boolean>(IS_CLIENTE_AUTH_KEY, alvos) ?? false;

		const req = ctx.switchToHttp().getRequest<RequestAutenticado>();
		const token = this.extrairToken(req);
		if (!token) throw new UnauthorizedException("Token não encontrado");

		let payload: JwtPayload;
		try {
			payload = await this.jwt.verifyAsync<JwtPayload>(token, { secret: process.env.JWT_SECRET });
		} catch {
			throw new UnauthorizedException("Token inválido ou expirado");
		}
		if (!payload.sub) throw new UnauthorizedException("Token sem identificação (sub)");

		if (payload.type === "cliente") {
			if (!rotaDeCliente) throw new UnauthorizedException("Rota não permitida para clientes");
			req.cliente = { id: payload.sub, nome: payload.nome ?? "", cpf: payload.cpf ?? "" };
			return true;
		}

		if (rotaDeCliente) throw new UnauthorizedException("Rota exclusiva para clientes autenticados por CPF");
		if (!payload.role || !ROLES_VALIDAS.has(payload.role)) throw new UnauthorizedException("Token sem função válida");

		req.user = { id: payload.sub, email: payload.email ?? "", role: payload.role as Role };
		return true;
	}

	private extrairToken(req: Request): string | undefined {
		const auth = req.headers["authorization"];
		if (!auth || typeof auth !== "string") return undefined;
		const [esquema, token] = auth.split(" ");
		if (esquema?.toLowerCase() !== "bearer" || !token) return undefined;
		return token;
	}
}
