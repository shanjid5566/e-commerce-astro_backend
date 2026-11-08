// backend/src/redis/redis.service.ts
import {
  Injectable,
  OnModuleInit,
  OnModuleDestroy,
  Logger,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import Redis from "ioredis";

/**
 * L1 in-memory cache entry structure.
 */
interface L1CacheEntry {
  value: any;
  expiresAt: number;
}

/**
 * RedisService provides high-performance multi-tier caching:
 * - L1: In-memory RAM cache (< 0.05ms) for instant local hits
 * - L2: Distributed Redis cache for cross-server synchronization
 */
@Injectable()
export class RedisService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RedisService.name);
  private client: Redis;

  // L1 In-Memory Cache (RAM) to eliminate WAN latency to remote Redis Cloud
  private readonly l1Cache = new Map<string, L1CacheEntry>();
  private readonly L1_DEFAULT_TTL_SEC = 60; // 1 minute in local RAM

  // Inject ConfigService to read REDIS_URL or REDIS_HOST from .env
  constructor(private readonly configService: ConfigService) {}

  /**
   * Initializes Redis connection on application startup.
   */
  async onModuleInit() {
    const redisUrl = this.configService.get<string>("REDIS_URL");
    const host = this.configService.get<string>("REDIS_HOST", "localhost");
    const port = Number(this.configService.get<Number>("REDIS_PORT", 6379));
    const password = this.configService.get<string>("REDIS_PASSWORD");

    const isVercel = Boolean(process.env.VERCEL || process.env.VERCEL_ENV);

    // In serverless environments, if REDIS_URL is not provided, skip localhost connection
    if (!redisUrl && (isVercel || process.env.NODE_ENV === "production")) {
      this.logger.warn("⚠️ REDIS_URL is not configured in production. Caching will run in bypass mode.");
      return;
    }

    try {
      if (redisUrl) {
        this.client = new Redis(redisUrl, {
          maxRetriesPerRequest: 1,
          connectTimeout: 2000,
          lazyConnect: true,
          retryStrategy: (times) => (times > 2 ? null : Math.min(times * 100, 500)),
        });
      } else {
        this.client = new Redis({
          host,
          port,
          password: password || undefined,
          maxRetriesPerRequest: 1,
          connectTimeout: 2000,
          lazyConnect: true,
          retryStrategy: (times) => (times > 2 ? null : Math.min(times * 100, 500)),
        });
      }

      this.client.on("connect", () => {
        this.logger.log("✅ Redis connected successfully");
      });
      this.client.on("error", (err) => {
        this.logger.error("❌ Redis connection error:", err.message);
      });

      await this.client.connect().catch((err) => {
        this.logger.warn(`Redis connection failed (${err.message}). Continuing in fallback mode.`);
      });
    } catch (err: any) {
      this.logger.error("❌ Failed to initialize Redis client:", err.message);
    }
  }

  /**
   * Gracefully close Redis connection on application shutdown.
   */
  async onModuleDestroy() {
    if (this.client) {
      await this.client.quit();
      this.logger.log("🔌 Redis disconnected");
    }
  }

  /**
   * Retrieve cached item with L1 RAM fast-path.
   */
  async get<T>(key: string): Promise<T | null> {
    const now = Date.now();

    // 1. Fast L1 In-Memory Cache Check (< 0.05ms)
    const l1Entry = this.l1Cache.get(key);
    if (l1Entry && now < l1Entry.expiresAt) {
      return l1Entry.value as T;
    } else if (l1Entry) {
      this.l1Cache.delete(key);
    }

    // 2. L2 Redis Cache Check (~200ms remote network round-trip)
    if (!this.client) return null;
    try {
      const data = await this.client.get(key);
      if (!data) return null;
      const parsed = JSON.parse(data) as T;

      // Populate L1 cache for subsequent instant hits
      this.l1Cache.set(key, {
        value: parsed,
        expiresAt: now + this.L1_DEFAULT_TTL_SEC * 1000,
      });

      return parsed;
    } catch (error) {
      this.logger.error(`Error reading Redis key: ${key}`, error);
      return null;
    }
  }

  /**
   * Store data in both L1 (local memory) and L2 (Redis).
   */
  async set(key: string, value: any, ttlSeconds: number = 3600): Promise<void> {
    const now = Date.now();
    const l1Ttl = Math.min(ttlSeconds, this.L1_DEFAULT_TTL_SEC);

    // Write to L1 RAM immediately (< 0.01ms)
    this.l1Cache.set(key, {
      value,
      expiresAt: now + l1Ttl * 1000,
    });

    // Write to L2 Redis asynchronously
    if (!this.client) return;
    try {
      const serialized = JSON.stringify(value);
      if (ttlSeconds > 0) {
        await this.client.set(key, serialized, "EX", ttlSeconds);
      } else {
        await this.client.set(key, serialized);
      }
    } catch (error) {
      this.logger.error(`Error setting Redis key: ${key}`, error);
    }
  }

  /**
   * Delete a specific cache key from both L1 and L2.
   */
  async del(key: string): Promise<void> {
    // Purge L1 immediately
    this.l1Cache.delete(key);

    if (!this.client) return;
    try {
      await this.client.del(key);
    } catch (error) {
      this.logger.error(`Error deleting Redis key: ${key}`, error);
    }
  }

  /**
   * Delete all keys matching a pattern (e.g. "cache:*").
   */
  async invalidatePattern(pattern: string): Promise<void> {
    // Purge matching keys from L1
    const prefix = pattern.replace('*', '');
    for (const key of this.l1Cache.keys()) {
      if (key.startsWith(prefix) || pattern === '*') {
        this.l1Cache.delete(key);
      }
    }

    if (!this.client) return;
    try {
      const stream = this.client.scanStream({
        match: pattern,
        count: 50,
      });
      stream.on("data", async (keys: string[]) => {
        if (keys.length > 0) {
          const pipeline = this.client.pipeline();
          keys.forEach((k) => pipeline.del(k));
          await pipeline.exec();
        }
      });
    } catch (error) {
      this.logger.error(`Error invalidating pattern: ${pattern}`, error);
    }
  }
}
