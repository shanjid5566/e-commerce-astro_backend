import {
  Injectable,
  OnModuleInit,
  OnModuleDestroy,
  Logger,
} from "@nestjs/common";
import { PrismaClient } from "@prisma/client";

/**
 * PrismaService manages database lifecycle and connection pooling.

 */

@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  // Logger helps us print clean, colored status logs in terminal

  private readonly logger = new Logger(PrismaService.name);

  async onModuleInit() {
    try {
      await this.$connect();
      this.logger.log("✅ PostgreSQL connected successfully via Prisma");
    } catch (error) {
      this.logger.error("❌ Failed to connect to PostgreSQL", error);
      // In serverless environments (like Vercel), do not exit process so function runtime does not crash
      if (!process.env.VERCEL) {
        process.exit(1);
      }
    }
  }
  /**
   * Gracefully disconnects from PostgreSQL when NestJS stops
   */
  async onModuleDestroy() {
    await this.$disconnect();
    this.logger.log("🔌 PostgreSQL disconnected");
  }
}
