import type { Config } from "drizzle-kit";
import { DATABASE_URL } from "./src/utils";

export default {
  schema: "./src/db/schema.ts",
  out: "./drizzle/api-migrations",
  dialect: "postgresql",
  dbCredentials: {
    url: DATABASE_URL ?? "",
  },
} satisfies Config;
