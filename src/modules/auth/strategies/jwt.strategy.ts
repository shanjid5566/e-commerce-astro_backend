// backend/src/modules/auth/strategies/jwt.strategy.ts
import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../../database/prisma.service';

/**
 * Payload encoded inside the JWT accessToken.
 */
export interface JwtPayload {
  sub: string; // Admin ID
  email: string;
  name: string;
}

/**
 * In-memory cached admin profile to avoid querying PostgreSQL on every request.
 */
interface CachedAdmin {
  id: string;
  email: string;
  name: string;
  createdAt: Date;
  cachedAt: number;
}

/**
 * JwtStrategy validates Bearer tokens from incoming HTTP Authorization headers.
 * Uses in-memory caching to eliminate redundant remote DB round-trips on every request.
 */
@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  // In-memory cache for validated admins (5 minutes TTL)
  private readonly adminCache = new Map<string, CachedAdmin>();
  private readonly CACHE_TTL_MS = 5 * 60 * 1000;

  constructor(
    private readonly configService: ConfigService,
    private readonly prisma: PrismaService,
  ) {
    super({
      // 1. Extract Bearer token from header: Authorization: Bearer <token>
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),

      // 2. Automatically reject expired tokens
      ignoreExpiration: false,

      // 3. Secret key to verify token signature
      secretOrKey: configService.get<string>('JWT_SECRET') || 'default_jwt_secret',
    });
  }

  /**
   * Validates payload and ensures the admin still exists in PostgreSQL.
   * Cached in memory for 5 minutes to reduce database round-trips.
   */
  async validate(payload: JwtPayload) {
    const now = Date.now();
    const cached = this.adminCache.get(payload.sub);

    // Fast path: Return from local memory if cached and not expired (< 0.05ms)
    if (cached && now - cached.cachedAt < this.CACHE_TTL_MS) {
      return {
        id: cached.id,
        email: cached.email,
        name: cached.name,
        createdAt: cached.createdAt,
      };
    }

    // Slow path: Query PostgreSQL over WAN if not in memory
    const admin = await this.prisma.admin.findUnique({
      where: { id: payload.sub },
      select: {
        id: true,
        email: true,
        name: true,
        createdAt: true,
      },
    });

    if (!admin) {
      this.adminCache.delete(payload.sub);
      throw new UnauthorizedException('Admin account not found or access revoked');
    }

    // Save to memory cache for subsequent instant hits
    this.adminCache.set(payload.sub, {
      ...admin,
      cachedAt: now,
    });

    return admin;
  }
}
