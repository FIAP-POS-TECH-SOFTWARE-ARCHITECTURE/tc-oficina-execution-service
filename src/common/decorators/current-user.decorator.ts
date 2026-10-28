import { createParamDecorator, ExecutionContext } from "@nestjs/common";
import { Role } from "../enums/role.enum";

export interface AuthenticatedUser {
	id: string;
	email: string;
	role: Role;
}

export const CurrentUser = createParamDecorator((_data: unknown, ctx: ExecutionContext): AuthenticatedUser | undefined => {
	const req = ctx.switchToHttp().getRequest<{ user?: AuthenticatedUser }>();
	return req.user;
});
