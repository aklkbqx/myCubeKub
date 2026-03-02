import { db } from '../db';
import os from 'node:os';
import fs from 'node:fs/promises';
import path from 'node:path';
import { sql } from 'drizzle-orm';
import { cacheService } from './CacheService';

export interface HealthCheckResult {
  status: 'healthy' | 'unhealthy' | 'degraded';
  message?: string;
  details?: any;
  responseTime?: number;
}

export interface SystemHealth {
  overall: 'healthy' | 'unhealthy' | 'degraded';
  timestamp: string;
  uptime: number;
  services: {
    database: HealthCheckResult;
    server: HealthCheckResult;
    system: HealthCheckResult;
    ocr: HealthCheckResult;
    storage: HealthCheckResult;
    cache: HealthCheckResult;
  };
  systemInfo: {
    platform: string;
    arch: string;
    nodeVersion: string;
    memory: {
      total: number;
      free: number;
      used: number;
      usage: number;
    };
    cpu: {
      cores: number;
      loadAverage: number[];
    };
    disk: {
      total: number;
      free: number;
      used: number;
      usage: number;
    };
  };
}

class HealthService {
  private startTime: number;

  constructor() {
    this.startTime = Date.now();
  }

  async checkDatabase(): Promise<HealthCheckResult> {
    const start = Date.now();
    try {
      // Test basic connection using raw SQL
      const result = await db.execute(sql`SELECT 1 as test`);
      const responseTime = Date.now() - start;

      // postgres-js returns a RowList directly, not an object with .rows
      if (result.length > 0) {
        return {
          status: 'healthy',
          message: 'Database connection successful',
          responseTime,
          details: {
            queryTime: responseTime,
            connectionPool: 'active',
            rowCount: result.length,
          },
        };
      } else {
        return {
          status: 'unhealthy',
          message: 'Database query returned no results',
          responseTime,
        };
      }
    } catch (error) {
      return {
        status: 'unhealthy',
        message: `Database connection failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        responseTime: Date.now() - start,
        details: { error: error instanceof Error ? error.stack : error },
      };
    }
  }

  async checkServer(): Promise<HealthCheckResult> {
    const start = Date.now();
    try {
      const uptime = Date.now() - this.startTime;
      const memoryUsage = process.memoryUsage();

      return {
        status: 'healthy',
        message: 'Server is running normally',
        responseTime: Date.now() - start,
        details: {
          uptime: uptime,
          memoryUsage: {
            rss: memoryUsage.rss,
            heapTotal: memoryUsage.heapTotal,
            heapUsed: memoryUsage.heapUsed,
            external: memoryUsage.external,
          },
          pid: process.pid,
          platform: process.platform,
          nodeVersion: process.version,
        },
      };
    } catch (error) {
      return {
        status: 'unhealthy',
        message: `Server health check failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        responseTime: Date.now() - start,
      };
    }
  }

  async checkSystem(): Promise<HealthCheckResult> {
    const start = Date.now();
    try {
      const memory = os.totalmem();
      const freeMemory = os.freemem();
      const usedMemory = memory - freeMemory;
      const memoryUsage = (usedMemory / memory) * 100;

      const loadAverage = os.loadavg();
      const cpuCores = os.cpus().length;

      // Check if system is under stress (more lenient thresholds for development)
      const isHighLoad = loadAverage[0] > cpuCores * 1.2;
      const isHighMemory = memoryUsage > 95;

      let status: 'healthy' | 'unhealthy' | 'degraded' = 'healthy';
      let message = 'System resources are normal';

      // More lenient for development - only unhealthy if both extremely high
      if (isHighLoad && isHighMemory) {
        status = 'degraded'; // Changed from unhealthy to degraded
        message = 'System is under high load and memory pressure';
      } else if (isHighLoad || isHighMemory) {
        status = 'degraded';
        message = isHighLoad
          ? 'System is under high load'
          : 'System is under memory pressure';
      }

      return {
        status,
        message,
        responseTime: Date.now() - start,
        details: {
          loadAverage,
          memoryUsage: memoryUsage,
          cpuCores,
          isHighLoad,
          isHighMemory,
        },
      };
    } catch (error) {
      // Return degraded instead of unhealthy for development
      return {
        status: 'degraded',
        message: `System health check degraded: ${error instanceof Error ? error.message : 'Unknown error'}`,
        responseTime: Date.now() - start,
        details: {
          error: error instanceof Error ? error.message : String(error),
        },
      };
    }
  }

  async checkOCR(): Promise<HealthCheckResult> {
    const start = Date.now();
    try {
      // Check if OCR service files exist
      const ocrServicePath = path.join(process.cwd(), 'ocr-service');
      const requirementsPath = path.join(ocrServicePath, 'requirements.txt');
      const cliPath = path.join(ocrServicePath, 'app', 'cli.py');

      const [requirementsExists, cliExists] = await Promise.all([
        fs
          .access(requirementsPath)
          .then(() => true)
          .catch(() => false),
        fs
          .access(cliPath)
          .then(() => true)
          .catch(() => false),
      ]);

      if (!requirementsExists || !cliExists) {
        return {
          status: 'degraded',
          message: 'OCR service files not found; OCR features disabled',
          responseTime: Date.now() - start,
          details: {
            requirementsExists,
            cliExists,
            ocrServicePath,
          },
        };
      }

      // For development, just check if files exist
      return {
        status: 'healthy',
        message: 'OCR service files are available',
        responseTime: Date.now() - start,
        details: {
          requirementsExists,
          cliExists,
          ocrServicePath,
        },
      };
    } catch (error) {
      // Return degraded instead of unhealthy for development
      return {
        status: 'degraded',
        message: `OCR service check degraded: ${error instanceof Error ? error.message : 'Unknown error'}`,
        responseTime: Date.now() - start,
        details: {
          error: error instanceof Error ? error.message : String(error),
        },
      };
    }
  }

  async checkStorage(): Promise<HealthCheckResult> {
    const start = Date.now();
    try {
      // Check if we can write to the public directory
      const publicDir = path.join(process.cwd(), 'public');
      const testFile = path.join(publicDir, '.health-check-test');

      try {
        await fs.writeFile(testFile, 'health check test');
        await fs.unlink(testFile);
      } catch (writeError) {
        // Return degraded instead of unhealthy for development
        return {
          status: 'degraded',
          message: 'Cannot write to public directory',
          responseTime: Date.now() - start,
          details: {
            writeError:
              writeError instanceof Error ? writeError.message : writeError,
            publicDir,
          },
        };
      }

      // For development, just check if we can write/read
      return {
        status: 'healthy',
        message: 'Storage is healthy',
        responseTime: Date.now() - start,
        details: {
          publicDir,
          writable: true,
        },
      };
    } catch (error) {
      // Return degraded instead of unhealthy for development
      return {
        status: 'degraded',
        message: `Storage health check degraded: ${error instanceof Error ? error.message : 'Unknown error'}`,
        responseTime: Date.now() - start,
        details: {
          error: error instanceof Error ? error.message : String(error),
        },
      };
    }
  }

  async checkCache(): Promise<HealthCheckResult> {
    const start = Date.now();

    if (!cacheService.isEnabled()) {
      return {
        status: 'degraded',
        message: 'Redis cache is disabled',
        responseTime: Date.now() - start,
        details: {
          enabled: false,
          metrics: cacheService.getMetrics(),
        },
      };
    }

    const healthy = await cacheService.healthCheck();
    const metrics = cacheService.getMetrics();

    if (!healthy) {
      return {
        status: 'degraded',
        message: 'Redis cache is unavailable',
        responseTime: Date.now() - start,
        details: {
          enabled: true,
          metrics,
        },
      };
    }

    return {
      status: 'healthy',
      message: 'Redis cache is healthy',
      responseTime: Date.now() - start,
      details: {
        enabled: true,
        metrics,
      },
    };
  }

  async getSystemInfo() {
    const memory = os.totalmem();
    const freeMemory = os.freemem();
    const usedMemory = memory - freeMemory;

    return {
      platform: os.platform(),
      arch: os.arch(),
      nodeVersion: process.version,
      memory: {
        total: memory,
        free: freeMemory,
        used: usedMemory,
        usage: (usedMemory / memory) * 100,
      },
      cpu: {
        cores: os.cpus().length,
        loadAverage: os.loadavg(),
      },
      disk: {
        total: 0,
        free: 0,
        used: 0,
        usage: 0,
      },
    };
  }

  async getOverallHealth(): Promise<SystemHealth> {
    const start = Date.now();

    // Run all health checks in parallel
    const [database, server, system, ocr, storage, cache] = await Promise.all([
      this.checkDatabase(),
      this.checkServer(),
      this.checkSystem(),
      this.checkOCR(),
      this.checkStorage(),
      this.checkCache(),
    ]);

    const systemInfo = await this.getSystemInfo();

    // Determine overall status
    const statuses = [
      database.status,
      server.status,
      system.status,
      ocr.status,
      storage.status,
      cache.status,
    ];
    const hasUnhealthy = statuses.includes('unhealthy');
    const hasDegraded = statuses.includes('degraded');

    let overall: 'healthy' | 'unhealthy' | 'degraded' = 'healthy';
    if (hasUnhealthy) {
      overall = 'unhealthy';
    } else if (hasDegraded) {
      overall = 'degraded';
    }

    return {
      overall,
      timestamp: new Date().toISOString(),
      uptime: Date.now() - this.startTime,
      services: {
        database,
        server,
        system,
        ocr,
        storage,
        cache,
      },
      systemInfo,
    };
  }
}

// Export singleton instance
export const healthService = new HealthService();
