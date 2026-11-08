// backend/src/app.module.ts
import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { AppController } from "./app.controller";
import { AppService } from "./app.service";
import { PrismaModule } from "./database/prisma.module";
import { RedisModule } from "./redis/redis.module";
import { AuthModule } from "./modules/auth/auth.module";
import { CategoriesModule } from "./modules/categories/categories.module";
import { UploadsModule } from "./modules/uploads/uploads.module";
import { ProductsModule } from "./modules/products/products.module";
import { AnnouncementsModule } from "./modules/announcements/announcements.module";
import { HeroSlidesModule } from "./modules/hero-slides/hero-slides.module";
import { OrdersModule } from "./modules/orders/orders.module";

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ".env",
    }),
    PrismaModule,
    RedisModule,
    AuthModule,
    CategoriesModule,
    UploadsModule,
    ProductsModule,
    AnnouncementsModule,
    HeroSlidesModule,
    OrdersModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
