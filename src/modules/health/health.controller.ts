import { Controller, Get, ServiceUnavailableException } from "@nestjs/common";
import { ApiOperation, ApiTags } from "@nestjs/swagger";
import { Public } from "../../common/decorators/public.decorator";
import { PrismaService } from "../../prisma/prisma.service";

@ApiTags("Health")
@Controller("health")
export class HealthController {
	constructor(private readonly prisma: PrismaService) {}

	@Public()
	@Get()
	@ApiOperation({ summary: "Liveness probe" })
	live() {
		return { status: "ok" };
	}

	@Public()
	@Get("ready")
	@ApiOperation({ summary: "Readiness probe (verifica banco)" })
	async ready() {
		try {
			await this.prisma.$queryRaw`SELECT 1`;
			return { status: "ok", database: "up" };
		} catch {
			throw new ServiceUnavailableException({ status: "error", database: "down" });
		}
	}
}
