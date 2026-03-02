import Redis from "ioredis";

const REDIS_URL = process.env.REDIS_URL;

interface CacheMetrics {
    hits: number;
    misses: number;
    writes: number;
    invalidations: number;
    errors: number;
    lastErrorAt: string | null;
    lastErrorMessage: string | null;
}

interface CacheInfo {
    enabled: boolean;
    connected: boolean;
    metrics: ReturnType<CacheService["getMetrics"]>;
}

class CacheService {
    private redis: Redis | null = null;
    private metrics: CacheMetrics = {
        hits: 0,
        misses: 0,
        writes: 0,
        invalidations: 0,
        errors: 0,
        lastErrorAt: null,
        lastErrorMessage: null,
    };

    constructor() {
        if (!REDIS_URL) {
            console.warn("[CacheService] REDIS_URL not set. Caching disabled.");
            return;
        }

        this.redis = new Redis(REDIS_URL, {
            retryStrategy: (times) => {
                if (times > 3) {
                    return null;
                }
                return Math.min(times * 50, 2000);
            },
        });

        this.redis.on("error", (err) => {
            this.recordError(err);
            console.error("[CacheService] Redis connection error:", err);
        });

        this.redis.on("connect", () => {
            console.log("[CacheService] Connected to Redis");
        });
    }

    async get<T>(key: string): Promise<T | null> {
        if (!this.redis) return null;
        try {
            const data = await this.redis.get(key);
            if (!data) {
                this.metrics.misses += 1;
                return null;
            }
            this.metrics.hits += 1;
            return JSON.parse(data) as T;
        } catch (error) {
            this.recordError(error);
            console.warn(`[CacheService] Failed to get key ${key}:`, error);
            return null;
        }
    }

    async set(key: string, value: any, ttlSeconds: number): Promise<void> {
        if (!this.redis) return;
        try {
            const data = JSON.stringify(value);
            await this.redis.set(key, data, "EX", ttlSeconds);
            this.metrics.writes += 1;
        } catch (error) {
            this.recordError(error);
            console.warn(`[CacheService] Failed to set key ${key}:`, error);
        }
    }

    async del(key: string): Promise<void> {
        if (!this.redis) return;
        try {
            await this.redis.del(key);
            this.metrics.invalidations += 1;
        } catch (error) {
            this.recordError(error);
            console.warn(`[CacheService] Failed to delete key ${key}:`, error);
        }
    }

    async delMany(keys: string[]): Promise<void> {
        if (!this.redis || keys.length === 0) return;
        try {
            await this.redis.del(...keys);
            this.metrics.invalidations += keys.length;
        } catch (error) {
            this.recordError(error);
            console.warn(`[CacheService] Failed to delete keys ${keys.join(", ")}:`, error);
        }
    }

    async delByPattern(pattern: string): Promise<void> {
        if (!this.redis) return;

        try {
            let cursor = "0";
            do {
                const [nextCursor, keys] = await this.redis.scan(
                    cursor,
                    "MATCH",
                    pattern,
                    "COUNT",
                    100
                );
                cursor = nextCursor;

                if (keys.length > 0) {
                    await this.redis.del(...keys);
                    this.metrics.invalidations += keys.length;
                }
            } while (cursor !== "0");
        } catch (error) {
            this.recordError(error);
            console.warn(`[CacheService] Failed to delete keys by pattern ${pattern}:`, error);
        }
    }

    async remember<T>(key: string, ttlSeconds: number, producer: () => Promise<T>): Promise<T> {
        const cached = await this.get<T>(key);
        if (cached !== null) {
            return cached;
        }

        const fresh = await producer();
        await this.set(key, fresh, ttlSeconds);
        return fresh;
    }

    getClient(): Redis | null {
        return this.redis;
    }

    isEnabled(): boolean {
        return this.redis !== null;
    }

    getMetrics() {
        const requests = this.metrics.hits + this.metrics.misses;
        return {
            ...this.metrics,
            requests,
            hitRate: requests > 0 ? this.metrics.hits / requests : 0,
        };
    }

    getInfo(): CacheInfo {
        return {
            enabled: this.isEnabled(),
            connected: this.redis?.status === "ready",
            metrics: this.getMetrics(),
        };
    }

    async flushAll(): Promise<boolean> {
        if (!this.redis) return false;
        try {
            await this.redis.flushdb();
            this.metrics.invalidations += 1;
            return true;
        } catch (error) {
            this.recordError(error);
            console.error("[CacheService] Failed to flush Redis:", error);
            return false;
        }
    }

    async flushByPattern(pattern: string): Promise<boolean> {
        if (!this.redis) return false;
        try {
            await this.delByPattern(pattern);
            return true;
        } catch (error) {
            this.recordError(error);
            console.error(`[CacheService] Failed to flush by pattern ${pattern}:`, error);
            return false;
        }
    }

    async healthCheck(): Promise<boolean> {
        if (!this.redis) return false;
        try {
            const result = await this.redis.ping();
            return result === 'PONG';
        } catch (error) {
            this.recordError(error);
            console.error("[CacheService] Health check failed:", error);
            return false;
        }
    }

    private recordError(error: unknown) {
        this.metrics.errors += 1;
        this.metrics.lastErrorAt = new Date().toISOString();
        this.metrics.lastErrorMessage = error instanceof Error ? error.message : String(error);
    }
}

export const cacheService = new CacheService();
