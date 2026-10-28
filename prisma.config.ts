import "dotenv/config";
import path from "node:path";
import { defineConfig } from "prisma/config";

export default defineConfig({
	engine: "classic",
	schema: path.join("prisma"),
	datasource: {
		url: process.env.DATABASE_URL!,
	},
});
