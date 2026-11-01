import { Global, Module } from "@nestjs/common";
import { PrismaService } from "./prisma.service";

/**
 * Global PrismaModule makes PrismaService accessible across all modules
 * without needing to import PrismaModule in every feature module.
 */

@Global()
@Module({
  providers: [PrismaService],
  exports: [PrismaService],
})
export class PrismaModule {}
