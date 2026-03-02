import { Elysia } from "elysia";
import { cors } from "@elysiajs/cors";
import { authRoutes } from "./routes/auth";
import { serverRoutes } from "./routes/servers";
import { fileRoutes } from "./routes/files";
import { consoleRoutes } from "./routes/console";

const app = new Elysia()
  .use(
    cors({
      origin: process.env.CORS_ORIGIN || "http://localhost:5173",
      credentials: true,
    })
  )
  .get("/config", () => ({
    connectionIp: process.env.CONNECTION_IP || "localhost",
  }))
  .get("/health", () => ({ status: "ok", timestamp: new Date().toISOString() }))
  .use(authRoutes)
  .use(serverRoutes)
  .use(fileRoutes)
  .use(consoleRoutes)
  .listen(Number(process.env.API_PORT) || 3000);

console.log(
  `🟩 myCubeKub API running at http://${app.server?.hostname}:${app.server?.port}`
);

export type App = typeof app;
