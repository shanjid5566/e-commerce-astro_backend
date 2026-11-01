import {
  Injectable,
  OnModuleInit,
  OnModuleDestroy,
  Logger,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import Redis from "ioredis";

/**
 * RedisService provides high-performance in-memory caching and cache invalidation.
 */

@Injectable()
export class RedisService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RedisService.name);

  private client: Redis;
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

    // Use connection string URL if available, otherwise use host/port

    if (redisUrl) {
      this.client = new Redis(redisUrl, {
        maxRetriesPerRequest: 3,
      });
    } else {
      this.client = new Redis({
        host,
        port,
        password: password || undefined,
        maxRetriesPerRequest: 3,
      });
    }

    this.client.on("connect", () => {
      this.logger.log("✅ Redis connected successfully");
    });
    this.client.on("error", (err) => {
      this.logger.error("❌ Redis connection error:", err.message);
    });
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
   * Retrieve cached item and parse JSON automatically.
   */
  async get<T>(key: string): Promise<T | null> {
    try {
      const data = await this.client.get(key);
      if (!data) return null;
      return JSON.parse(data) as T;
    } catch (error) {
      this.logger.error(`Error reading Redis key: ${key}`, error);
      return null;
    }
  }

  /**
   * Store data in Redis with an optional Time-To-Live (TTL in seconds).
   */
  async set(key: string, value: any, ttlSeconds: number = 3600): Promise<void> {
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
   * Delete a specific cache key.
   */
  async del(key: string): Promise<void> {
    try {
      await this.client.del(key);
    } catch (error) {
      this.logger.error(`Error deleting Redis key: ${key}`, error);
    }
  }

  /**
   * Delete all keys matching a pattern (e.g. "products:*").
   * Uses SCAN instead of KEYS to avoid blocking the single-threaded Redis event loop in production.
   */

  async invalidatePattern(pattern: string): Promise<void> {
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
