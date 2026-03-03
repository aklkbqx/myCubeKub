import Elysia, { t } from 'elysia';
import Auth from "./auth"
import Cache from "./cache"
import Files from "./files"
import Console from "./console"
import Servers from "./servers"
import ResourcePacks from "./resourcePacks"
import { startAutoBackupScheduler } from "../services/backups"

startAutoBackupScheduler();

const app = new Elysia()
    .get(
        "/config",
        () => ({
            connectionIp: process.env.CONNECTION_IP || "localhost",
        }),
        {
            response: t.Object({
                connectionIp: t.String(),
            }),
        }
    )
    .get(
        "/health",
        () => ({ status: "ok", timestamp: new Date().toISOString() }),
        {
            response: t.Object({
                status: t.String(),
                timestamp: t.String(),
            }),
        }
    )
    .use(Auth)
    .use(Cache)
    .use(Files)
    .use(Console)
    .use(Servers)
    .use(ResourcePacks)

export default app;
