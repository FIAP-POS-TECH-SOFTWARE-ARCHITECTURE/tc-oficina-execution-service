import { SetMetadata } from "@nestjs/common";

export const IS_CLIENTE_AUTH_KEY = "isClienteAuth";
export const ClienteAuth = () => SetMetadata(IS_CLIENTE_AUTH_KEY, true);
