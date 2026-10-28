import { Controller, Get, INestApplication } from "@nestjs/common";
import { JwtModule, JwtService } from "@nestjs/jwt";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { configurarApp } from "./app.setup";
import { Public } from "./common/decorators/public.decorator";
import { Roles } from "./common/decorators/roles.decorator";
import { Role } from "./common/enums/role.enum";

@Controller()
class ControladorTeste {
	@Public()
	@Get("health")
	saude() {
		return { status: "ok" };
	}

	@Roles(Role.ADMINISTRADOR)
	@Get("execucao/restrito")
	restrito() {
		return { ok: true };
	}
}

describe("configurarApp", () => {
	const SEGREDO = "segredo-configuracao";
	let app: INestApplication;
	let jwt: JwtService;

	beforeAll(async () => {
		process.env.JWT_SECRET = SEGREDO;
		const modulo = await Test.createTestingModule({
			imports: [JwtModule.register({ secret: SEGREDO })],
			controllers: [ControladorTeste],
		}).compile();
		app = modulo.createNestApplication();
		configurarApp(app);
		await app.init();
		jwt = modulo.get(JwtService);
	});

	afterAll(() => app.close());

	it("rota pública responde no envelope semantic-response", async () => {
		const res = await request(app.getHttpServer()).get("/health").expect(200);
		expect(res.body).toEqual({ status: 200, success: true, data: { status: "ok" } });
	});

	it("rota protegida sem token → 401", async () => {
		await request(app.getHttpServer()).get("/execucao/restrito").expect(401);
	});

	it("staff com role permitida → 200; role insuficiente → 403", async () => {
		const admin = await jwt.signAsync({ sub: "u1", email: "a@b.c", role: "ADMINISTRADOR" });
		const atendente = await jwt.signAsync({ sub: "u2", email: "c@d.e", role: "ATENDENTE" });
		await request(app.getHttpServer()).get("/execucao/restrito").set("authorization", `Bearer ${admin}`).expect(200);
		await request(app.getHttpServer()).get("/execucao/restrito").set("authorization", `Bearer ${atendente}`).expect(403);
	});

	it("limite de requisições é por usuário autenticado, não pelo IP compartilhado do gateway", async () => {
		const ana = await jwt.signAsync({ sub: "ana", email: "a@o", role: "ADMINISTRADOR" });
		const bruno = await jwt.signAsync({ sub: "bruno", email: "b@o", role: "ADMINISTRADOR" });
		const restante = async (token: string) =>
			Number(
				(await request(app.getHttpServer()).get("/execucao/restrito").set("authorization", `Bearer ${token}`)).headers[
					"ratelimit-remaining"
				],
			);
		await restante(ana);
		const anaDepois = await restante(ana);
		expect(await restante(bruno)).toBe(anaDepois + 1);
	});

	it("token com assinatura inválida conta no limite do IP (sub forjado não abre limite novo)", async () => {
		const forjado = await new JwtService({ secret: "outro" }).signAsync({ sub: "x", role: "ADMINISTRADOR" });
		const outroForjado = await new JwtService({ secret: "outro" }).signAsync({ sub: "y", role: "ADMINISTRADOR" });
		const restante = async (token: string) =>
			Number(
				(await request(app.getHttpServer()).get("/execucao/restrito").set("authorization", `Bearer ${token}`)).headers[
					"ratelimit-remaining"
				],
			);
		const primeiro = await restante(forjado);
		expect(await restante(outroForjado)).toBe(primeiro - 1);
	});

	it("publica o Swagger em /execucao/docs", async () => {
		const res = await request(app.getHttpServer()).get("/execucao/docs-json").expect(200);
		expect(res.body.info.title).toBe("Oficina Execution Service");
	});
});
