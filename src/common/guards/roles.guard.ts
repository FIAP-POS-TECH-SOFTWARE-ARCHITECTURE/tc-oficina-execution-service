import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { Request } from "express";
import { ROLES_KEY } from "../decorators/roles.decorator";
import { Role } from "../enums/role.enum";

@Injectable()
export class RolesGuard implements CanActivate {
	constructor(private readonly reflector: Reflector) {}

	canActivate(ctx: ExecutionContext): boolean {
		const required = this.reflector.getAllAndOverride<Role[]>(ROLES_KEY, [ctx.getHandler(), ctx.getClass()]);
		if (!required || required.length === 0) return true;

		const req = ctx.switchToHttp().getRequest<Request & { user?: { role?: Role } }>();
		const user = req.user;

		if (!user?.role) throw new ForbiddenException("Usuário não autenticado.");

		if (!required.includes(user.role)) throw new ForbiddenException("Acesso negado para sua função atual.");

		return true;
	}
}
