import { Elysia, t } from "elysia";
import authGuard from "../services/authGuard";
import * as dockerService from "../services/docker";

const consoleCommandSchema = t.Object({
  type: t.Literal("command"),
  command: t.String(),
});

const consoleEventSchema = t.Union([
  t.Object({
    type: t.Literal("log"),
    data: t.String(),
    timestamp: t.String(),
  }),
  t.Object({
    type: t.Literal("error"),
    data: t.String(),
  }),
  t.Object({
    type: t.Literal("info"),
    data: t.String(),
  }),
  t.Object({
    type: t.Literal("command_result"),
    command: t.String(),
    data: t.String(),
    timestamp: t.String(),
  }),
]);

const consoleRoutes = new Elysia({ prefix: "/servers" })
  .use(authGuard)

  // ─── WebSocket console (logs + RCON) ──────────────────────
  .ws("/:id/console", {
    params: t.Object({ id: t.String() }),
    body: consoleCommandSchema,
    response: consoleEventSchema,
    open(ws) {
      if ((ws.data as any).authUnavailable) {
        ws.send({
          type: "error",
          data: "Authentication schema is not ready. Run database migrations first.",
        });
        ws.close();
        return;
      }

      if (!(ws.data as any).user) {
        ws.send({
          type: "error",
          data: "Not authenticated",
        });
        ws.close();
        return;
      }

      const id = (ws.data.params as any).id;
      console.log(`[WS] Console opened for server ${id}`);

      // Stream Docker logs
      const container = dockerService.getContainer(id);

      container
        .logs({
          follow: true,
          stdout: true,
          stderr: true,
          tail: 100,
          timestamps: true,
        })
        .then((stream) => {
          // Store stream reference for cleanup
          (ws as any)._logStream = stream;

          stream.on("data", (chunk: Buffer) => {
            // Docker stream has 8-byte header per frame
            const lines = chunk.toString("utf-8");
            // Remove docker stream header bytes (first 8 bytes per chunk)
            const cleanLines = lines
              .split("\n")
              .map((line) => {
                // Remove docker multiplex header (8 bytes)
                if (line.length > 8) {
                  const cleaned = line.substring(8).replace(/^[\x00-\x1f]+/, "");
                  return cleaned || line;
                }
                return line;
              })
              .filter((l) => l.trim())
              .join("\n");

            if (cleanLines.trim()) {
              try {
                ws.send({
                  type: "log",
                  data: cleanLines,
                  timestamp: new Date().toISOString(),
                });
              } catch {
                // ws might be closed
              }
            }
          });

          stream.on("error", (err: Error) => {
            try {
              ws.send({
                type: "error",
                data: `Log stream error: ${err.message}`,
              });
            } catch {
              // ws might be closed
            }
          });

          stream.on("end", () => {
            try {
              ws.send({
                type: "info",
                data: "Log stream ended",
              });
            } catch {
              // ws might be closed
            }
          });
        })
        .catch((err) => {
          ws.send({
            type: "error",
            data: `Failed to attach logs: ${err.message}`,
          });
        });
    },

    async message(ws, message) {
      const id = (ws.data.params as any).id;

      try {
        const msg = typeof message === "string" ? JSON.parse(message) : message;

        if (msg.type === "command") {
          // Execute RCON command
          // For now, use docker exec as RCON fallback
          const container = dockerService.getContainer(id);

          try {
            const exec = await container.exec({
              Cmd: ["rcon-cli", msg.command],
              AttachStdout: true,
              AttachStderr: true,
            });

            const execStream = await exec.start({ Detach: false });
            let output = "";

            execStream.on("data", (chunk: Buffer) => {
              output += chunk.toString("utf-8");
            });

            execStream.on("end", () => {
              // Clean output
              const cleanOutput = output
                .split("\n")
                .map((l) => (l.length > 8 ? l.substring(8) : l))
                .join("\n")
                .trim();

              ws.send({
                type: "command_result",
                command: msg.command,
                data: cleanOutput || "(no output)",
                timestamp: new Date().toISOString(),
              });
            });
          } catch (err: any) {
            ws.send({
              type: "error",
              data: `RCON error: ${err.message}`,
            });
          }
        }
      } catch (err: any) {
        ws.send({
          type: "error",
          data: `Message error: ${err.message}`,
        });
      }
    },

    close(ws) {
      const id = (ws.data.params as any).id;
      console.log(`[WS] Console closed for server ${id}`);

      // Clean up log stream
      const stream = (ws as any)._logStream;
      if (stream && typeof stream.destroy === "function") {
        stream.destroy();
      }
    },
  });



export default consoleRoutes
