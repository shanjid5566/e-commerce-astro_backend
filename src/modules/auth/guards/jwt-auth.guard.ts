// backend/src/modules/auth/guards/jwt-auth.guard.ts
import { Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

/**
 * JwtAuthGuard protects endpoints by requiring a valid JWT Bearer token.
 * Usage: `@UseGuards(JwtAuthGuard)` on controllers or individual routes.
 */
@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {}