export const CACHE_PREFIX = "mycubekub";

const encodeSegment = (value: string) => encodeURIComponent(value);

const getTtl = (envKey: string, fallback: number) => {
  const raw = process.env[envKey];
  if (!raw) return fallback;

  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback;
  }

  return Math.floor(parsed);
};

export const CACHE_TTL = {
  health: getTtl("CACHE_TTL_HEALTH_SEC", 5),
  authSession: getTtl("CACHE_TTL_AUTH_SESSION_SEC", 300),
  serverList: getTtl("CACHE_TTL_SERVER_LIST_SEC", 10),
  serverDetail: getTtl("CACHE_TTL_SERVER_DETAIL_SEC", 10),
  serverStats: getTtl("CACHE_TTL_SERVER_STATS_SEC", 3),
  serverProperties: getTtl("CACHE_TTL_SERVER_PROPERTIES_SEC", 30),
  filesList: getTtl("CACHE_TTL_FILES_LIST_SEC", 15),
  fileContent: getTtl("CACHE_TTL_FILE_CONTENT_SEC", 15),
} as const;

export const cacheKeys = {
  health: {
    overall: `${CACHE_PREFIX}:health:overall`,
  },
  auth: {
    session: (sessionId: string) => `${CACHE_PREFIX}:auth:session:${sessionId}`,
  },
  servers: {
    list: `${CACHE_PREFIX}:servers:list`,
    detail: (serverId: string) => `${CACHE_PREFIX}:servers:${serverId}:detail`,
    stats: (serverId: string) => `${CACHE_PREFIX}:servers:${serverId}:stats`,
    properties: (serverId: string) => `${CACHE_PREFIX}:servers:${serverId}:properties`,
    pattern: (serverId: string) => `${CACHE_PREFIX}:servers:${serverId}:*`,
  },
  files: {
    list: (serverId: string, relativePath = "") =>
      `${CACHE_PREFIX}:files:${serverId}:list:${encodeSegment(relativePath)}`,
    content: (serverId: string, relativePath: string) =>
      `${CACHE_PREFIX}:files:${serverId}:content:${encodeSegment(relativePath)}`,
    pattern: (serverId: string) => `${CACHE_PREFIX}:files:${serverId}:*`,
  },
};

export const cacheScopes = {
  all: `${CACHE_PREFIX}:*`,
  health: `${CACHE_PREFIX}:health:*`,
  auth: `${CACHE_PREFIX}:auth:*`,
  servers: `${CACHE_PREFIX}:servers:*`,
  files: `${CACHE_PREFIX}:files:*`,
} as const;

export type CacheScope = keyof typeof cacheScopes;

export const getSessionCacheTtl = (expiresAt: Date) => {
  const secondsUntilExpiry = Math.floor((expiresAt.getTime() - Date.now()) / 1000);
  return Math.max(1, Math.min(secondsUntilExpiry, CACHE_TTL.authSession));
};
