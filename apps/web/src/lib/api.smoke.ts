import { api, type ConsoleCommandMessage, type ConsoleEvent } from "./api";

type Equal<A, B> =
  (<T>() => T extends A ? 1 : 2) extends
  (<T>() => T extends B ? 1 : 2) ? true : false;

type Expect<T extends true> = T;

type HealthResponse = Awaited<ReturnType<typeof api.health>>;
type ConfigResponse = Awaited<ReturnType<typeof api.config>>;
type LoginResponse = Awaited<ReturnType<typeof api.auth.login>>;
type ServerListResponse = Awaited<ReturnType<typeof api.servers.list>>;
type FileListResponse = Awaited<ReturnType<typeof api.files.list>>;
type UploadResponse = Awaited<ReturnType<typeof api.files.upload>>;
type ConsoleSocket = ReturnType<typeof api.console.connect>;
type ConsoleSendPayload = Parameters<ConsoleSocket["send"]>[0];

type _healthShape = Expect<Equal<HealthResponse, { status: string; timestamp: string }>>;
type _configShape = Expect<Equal<ConfigResponse, { connectionIp: string }>>;
type _loginShape = Expect<Equal<LoginResponse, { user: { id: string; username: string } }>>;
type _serverListShape = Expect<Equal<keyof ServerListResponse, "servers">>;
type _fileListShape = Expect<Equal<keyof FileListResponse, "files" | "path">>;
type _uploadShape = Expect<Equal<UploadResponse, { success: boolean; filename: string }>>;
type _consoleSendShape = Expect<ConsoleCommandMessage extends ConsoleSendPayload ? true : false>;

// Compile-time smoke checks for Eden WebSocket contract.
const consoleSocket = api.console.connect("server-id");
consoleSocket.send({
  type: "command",
  command: "say hello",
} satisfies ConsoleCommandMessage);
consoleSocket.subscribe((event) => {
  void (event.data as ConsoleEvent | string);
});
