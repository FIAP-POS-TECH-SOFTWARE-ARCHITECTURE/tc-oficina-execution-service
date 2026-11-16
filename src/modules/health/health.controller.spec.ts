import { HealthController } from "./health.controller";

describe("HealthController", () => {
	const prisma = { $queryRaw: jest.fn() };

	const sut = new HealthController(prisma as any);

	afterEach(() => jest.clearAllMocks());

	it("liveness responde ok sem tocar no banco", () => {
		expect(sut.live()).toEqual({ status: "ok" });
		expect(prisma.$queryRaw).not.toHaveBeenCalled();
	});

	it("readiness ok quando banco responde", async () => {
		prisma.$queryRaw.mockResolvedValue([{ "?column?": 1 }]);
		await expect(sut.ready()).resolves.toEqual({ status: "ok", database: "up" });
	});

	it("readiness lança 503 quando banco cai", async () => {
		prisma.$queryRaw.mockRejectedValue(new Error("down"));
		await expect(sut.ready()).rejects.toMatchObject({ status: 503 });
	});
});
