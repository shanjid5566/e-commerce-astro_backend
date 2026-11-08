// backend/src/common/interceptors/transform.interceptor.ts
import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
  Logger,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { Request, Response } from 'express';

/**
 * Standard API response envelope interface with execution timing.
 */
export interface ApiResponse<T> {
  success: boolean;
  statusCode: number;
  data: T;
  timestamp: string;
  executionTime: string;
}

/**
 * TransformInterceptor wraps all outgoing responses and measures exact API response time.
 */
@Injectable()
export class TransformInterceptor<T> implements NestInterceptor<T, ApiResponse<T>> {
  private readonly logger = new Logger('HTTP');

  intercept(context: ExecutionContext, next: CallHandler): Observable<ApiResponse<T>> {
    const startTime = Date.now();
    const ctx = context.switchToHttp();
    const request = ctx.getRequest<Request>();
    const response = ctx.getResponse<Response>();

    return next.handle().pipe(
      map((data) => {
        const statusCode = response.statusCode;
        const duration = Date.now() - startTime;
        const executionTime = `${duration}ms`;

        // Set response header for frontend / postman inspection
        response.setHeader('X-Response-Time', executionTime);

        // Color-coded log for terminal observability
        if (duration > 500) {
          this.logger.warn(`🐢 [${request.method}] ${request.originalUrl} - ${statusCode} [${executionTime}] (Slow query)`);
        } else {
          this.logger.log(`⚡ [${request.method}] ${request.originalUrl} - ${statusCode} [${executionTime}]`);
        }

        return {
          success: true,
          statusCode,
          data: data ?? null,
          timestamp: new Date().toISOString(),
          executionTime,
        };
      }),
    );
  }
}
