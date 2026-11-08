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
 * JwtStrategy validates Bearer tokens from incoming HTTP Authorization headers.
 */
@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
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
   * The returned admin object is automatically injected into `request.user`.
   */
  async validate(payload: JwtPayload) {
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
      throw new UnauthorizedException('Admin account not found or access revoked');
    }

    return admin;
  }
}