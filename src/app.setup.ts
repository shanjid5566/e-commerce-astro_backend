import {
  INestApplication,
  ValidationPipe,
  VersioningType,
} from "@nestjs/common";
import { TransformInterceptor } from "./common/interceptors/transform.interceptor";
import { AllExceptionsFilter } from "./common/filters/all-exceptions.filter";

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

  // 2. Global URL Prefix & Versioning: /api/v1/... (exclude '/' for root health check)
  app.setGlobalPrefix("api", {
    exclude: ["/"],
  });
  app.enableVersioning({
    type: VersioningType.URI,
    defaultVersion: "1",
  });

  // 3. Strict Payload Validation Pipe
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

