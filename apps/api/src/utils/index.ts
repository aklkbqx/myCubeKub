// backend/src/utils/index.ts
export const API_PORT = process.env.API_PORT!
export const DOCS_PORT = process.env.DOCS_PORT!
export const JWT_SECRET = process.env.JWT_SECRET!
export const DATABASE_URL = process.env.DATABASE_URL!
export const PROJECT_NAME = process.env.PROJECT_NAME!
const parseBoolean = (value: string | undefined, fallback: boolean) =>
  (value ?? String(fallback)).toLowerCase() === 'true'

const parseNumber = (value: string | undefined, fallback: number) => {
  const parsed = Number(value)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback
}

export const READINESS_MAX_WAIT_MS = parseNumber(process.env.READINESS_MAX_WAIT_MS, 30000)
export const READINESS_INTERVAL_MS = parseNumber(process.env.READINESS_INTERVAL_MS, 2000)
export const READINESS_ALLOW_DEGRADED = parseBoolean(process.env.READINESS_ALLOW_DEGRADED, true)
export const READINESS_ENABLED = parseBoolean(process.env.READINESS_ENABLED, process.env.NODE_ENV === 'production')
export const SWAGGER_ENABLED = parseBoolean(process.env.SWAGGER_ENABLED, false)
export const SWAGGER_SERVER_URL = process.env.SWAGGER_SERVER_URL || '/'
export const PUBLIC_FILE_BASE_URL = process.env.PUBLIC_FILE_BASE_URL!.replace(/\/+$/, '')
export const JWT_EXPIRES_IN_HOURS = parseNumber(process.env.JWT_EXPIRES_IN_HOURS, 24);
export const ENABLE_PASSWORD_HASH_ENDPOINT = parseBoolean(process.env.ENABLE_PASSWORD_HASH_ENDPOINT, false);

export const RATE_LIMIT_ENABLED = parseBoolean(process.env.RATE_LIMIT_ENABLED, true)
export const RATE_LIMIT_AUTH_ENABLED = parseBoolean(process.env.RATE_LIMIT_AUTH_ENABLED, true)
export const RATE_LIMIT_LOG_EXCEEDED = parseBoolean(process.env.RATE_LIMIT_LOG_EXCEEDED, true)
export const RATE_LIMIT_API_WINDOW_MS = parseNumber(process.env.RATE_LIMIT_API_WINDOW_MS, 60000)
export const RATE_LIMIT_API_MAX = parseNumber(process.env.RATE_LIMIT_API_MAX, 300)
export const RATE_LIMIT_AUTH_WINDOW_MS = parseNumber(process.env.RATE_LIMIT_AUTH_WINDOW_MS, 60000)
export const RATE_LIMIT_AUTH_MAX = parseNumber(process.env.RATE_LIMIT_AUTH_MAX, 10)
export const RATE_LIMIT_FILES_WINDOW_MS = parseNumber(process.env.RATE_LIMIT_FILES_WINDOW_MS, 60000)
export const RATE_LIMIT_FILES_MAX = parseNumber(process.env.RATE_LIMIT_FILES_MAX, 120)
export const RATE_LIMIT_EXPENSIVE_WINDOW_MS = parseNumber(process.env.RATE_LIMIT_EXPENSIVE_WINDOW_MS, 60000)
export const RATE_LIMIT_EXPENSIVE_MAX = parseNumber(process.env.RATE_LIMIT_EXPENSIVE_MAX, 30)
export const RATE_LIMIT_PUBLIC_WINDOW_MS = parseNumber(process.env.RATE_LIMIT_PUBLIC_WINDOW_MS, 60000)
export const RATE_LIMIT_PUBLIC_MAX = parseNumber(process.env.RATE_LIMIT_PUBLIC_MAX, 120)
export const RATE_LIMIT_NOTIFICATIONS_WINDOW_MS = parseNumber(process.env.RATE_LIMIT_NOTIFICATIONS_WINDOW_MS, 60000)
export const RATE_LIMIT_NOTIFICATIONS_MAX = parseNumber(process.env.RATE_LIMIT_NOTIFICATIONS_MAX, 60)
export const RATE_LIMIT_PROFILE_WINDOW_MS = parseNumber(process.env.RATE_LIMIT_PROFILE_WINDOW_MS, 60000)
export const RATE_LIMIT_PROFILE_MAX = parseNumber(process.env.RATE_LIMIT_PROFILE_MAX, 60)
export const RATE_LIMIT_ADMIN_WINDOW_MS = parseNumber(process.env.RATE_LIMIT_ADMIN_WINDOW_MS, 60000)
export const RATE_LIMIT_ADMIN_MAX = parseNumber(process.env.RATE_LIMIT_ADMIN_MAX, 60)
export const RATE_LIMIT_RESPONDER_WINDOW_MS = parseNumber(process.env.RATE_LIMIT_RESPONDER_WINDOW_MS, 60000)
export const RATE_LIMIT_RESPONDER_MAX = parseNumber(process.env.RATE_LIMIT_RESPONDER_MAX, 60)

export * from './pagination'
