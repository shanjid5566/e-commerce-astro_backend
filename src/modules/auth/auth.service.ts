// backend/src/modules/auth/auth.service.ts
import { Injectable, UnauthorizedException, NotFoundException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../../database/prisma.service';
import { LoginDto } from './dto/login.dto';
import { verifyPassword } from './utils/password.util';
import { JwtPayload } from './strategies/jwt.strategy';

/**
 * AuthService handles administrator login and credential validation.
 */
@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
  ) {}

  /**
   * Validates admin credentials and generates a signed JWT access token.
   */
  async login(loginDto: LoginDto) {
    const { email, password } = loginDto;

    // 1. Find admin by unique email
    const admin = await this.prisma.admin.findUnique({
      where: { email },
    });

    if (!admin) {
      // Generic error message prevents username harvesting attacks
      throw new UnauthorizedException('Invalid email or password');
    }

    // 2. Verify scrypt password hash using timing-safe comparison
    const isPasswordValid = verifyPassword(password, admin.passwordHash);
    if (!isPasswordValid) {
      throw new UnauthorizedException('Invalid email or password');
    }

    // 3. Create JWT claims payload
    const payload: JwtPayload = {
      sub: admin.id,
      email: admin.email,
      name: admin.name,
    };

    // 4. Sign and issue JWT access token
    const accessToken = await this.jwtService.signAsync(payload);

    return {
      accessToken,
      admin: {
        id: admin.id,
        email: admin.email,
        name: admin.name,
      },
    };
  }

  /**
   * Retrieves profile of currently logged-in administrator.
   */
  async getProfile(adminId: string) {
    const admin = await this.prisma.admin.findUnique({
      where: { id: adminId },
      select: {
        id: true,
        email: true,
        name: true,
        createdAt: true,
      },
    });

    if (!admin) {
      throw new NotFoundException('Admin account not found');
    }

    return admin;
  }
}