// backend/src/app.setup.ts
import {
  INestApplication,
  ValidationPipe,
  VersioningType,
} from "@nestjs/common";
import { TransformInterceptor } from "./common/interceptors/transform.interceptor";
import { AllExceptionsFilter } from "./common/filters/all-exceptions.filter";
import * as express from "express";
import { join } from "path";
import * as fs from "fs";
import * as os from "os";

/**
 * Shared configuration for both standalone server and serverless function.
 */
export function setupApp(app: INestApplication) {
  // 1. CORS for Astro Storefront & Admin (allow local and deployed origins)
  const allowedOrigins = process.env.FRONTEND_URL
    ? [process.env.FRONTEND_URL, "http://localhost:4321", "http://127.0.0.1:4321"]
    : true;

  app.enableCors({
    origin: allowedOrigins,
    credentials: true,
  });

  // 2. Static File Serving for Uploaded Media
  const uploadsDir = process.env.VERCEL
    ? join(os.tmpdir(), "uploads")
    : join(process.cwd(), "uploads");

  try {
    if (!fs.existsSync(uploadsDir)) {
      fs.mkdirSync(uploadsDir, { recursive: true });
    }
  } catch {
    // Read-only filesystem safeguard for serverless environments
  }
  app.use("/uploads", express.static(uploadsDir));

  // 3. Global URL Prefix & Versioning: /api/v1/... (exclude '/' and '/uploads' for static assets)
  app.setGlobalPrefix("api", {
    exclude: ["/", "/uploads/(.*)"],
  });
  app.enableVersioning({
    type: VersioningType.URI,
    defaultVersion: "1",
  });

  // 4. Strict Payload Validation Pipe
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: {
        enableImplicitConversion: true,
      },
    }),
  );

  app.useGlobalInterceptors(new TransformInterceptor());
  app.useGlobalFilters(new AllExceptionsFilter());
}
