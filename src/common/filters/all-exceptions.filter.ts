// backend/src/common/filters/all-exceptions.filter.ts
import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';

/**
 * WinterCart Global Exception Filter
 * English: Formats all application errors into a predictable JSON structure.
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger('ErrorHandler');

  catch(exception: any, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let message: string | object = 'Internal server error occurred';

    // 1. Handle NestJS HTTP exceptions (e.g., 400 Bad Request, 401 Unauthorized, 404 Not Found)
    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const res = exception.getResponse();
      message = typeof res === 'object' && (res as any).message ? (res as any).message : res;
    } 
    // 2. Handle Prisma specific database errors
    else if (exception?.code === 'P2002') {
      status = HttpStatus.CONFLICT;
      const target = exception.meta?.target ? ` on field: ${exception.meta.target}` : '';
      message = `Unique constraint failed${target}`;
    } else if (exception?.code === 'P2025') {
      status = HttpStatus.NOT_FOUND;
      message = 'Requested record not found in database';
    } 
    // 3. Log unexpected errors to terminal
    else if (exception instanceof Error) {
      this.logger.error(`Error on ${request.url}: ${exception.message}`, exception.stack);
    }

    // Return unified JSON error envelope
    response.status(status).json({
      success: false,
      statusCode: status,
      message,
      path: request.url,
      timestamp: new Date().toISOString(),
    });
  }
}