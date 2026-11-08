// backend/src/modules/announcements/announcements.service.ts
import { Injectable, NotFoundException, Logger } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { RedisService } from '../../redis/redis.service';
import { CreateAnnouncementDto } from './dto/create-announcement.dto';
import { UpdateAnnouncementDto } from './dto/update-announcement.dto';

const CACHE_KEY_ACTIVE = 'cache:announcements:active';
const CACHE_KEY_ALL = 'cache:announcements:all';
const CACHE_TTL_SECONDS = 300; // 5 minutes TTL for scheduling freshness

@Injectable()
export class AnnouncementsService {
  private readonly logger = new Logger(AnnouncementsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {}

  /**
   * Fetch active announcements for storefront top ticker.
   * Respects optional startDate and endDate scheduling windows.
   */
  async findActive() {
    const cached = await this.redis.get<any[]>(CACHE_KEY_ACTIVE);
    if (cached) {
      return cached;
    }

    const now = new Date();

    const announcements = await this.prisma.announcement.findMany({
      where: {
        isActive: true,
        AND: [
          {
            OR: [{ startDate: null }, { startDate: { lte: now } }],
          },
          {
            OR: [{ endDate: null }, { endDate: { gte: now } }],
          },
        ],
      },
      orderBy: [{ order: 'asc' }, { createdAt: 'desc' }],
    });

    await this.redis.set(CACHE_KEY_ACTIVE, announcements, CACHE_TTL_SECONDS);
    return announcements;
  }

  /**
   * Fetch all announcements for admin management dashboard.
   */
  async findAllAdmin() {
    const cached = await this.redis.get<any[]>(CACHE_KEY_ALL);
    if (cached) {
      return cached;
    }

    const announcements = await this.prisma.announcement.findMany({
      orderBy: [{ order: 'asc' }, { createdAt: 'desc' }],
    });

    await this.redis.set(CACHE_KEY_ALL, announcements, CACHE_TTL_SECONDS);
    return announcements;
  }

  /**
   * Fetch a single announcement by ID.
   */
  async findOne(id: string) {
    const announcement = await this.prisma.announcement.findUnique({
      where: { id },
    });

    if (!announcement) {
      throw new NotFoundException(`Announcement with ID '${id}' not found`);
    }

    return announcement;
  }

  /**
   * Create a new announcement with optional scheduling dates.
   */
  async create(dto: CreateAnnouncementDto) {
    const created = await this.prisma.announcement.create({
      data: {
        text: dto.text,
        icon: dto.icon ?? '🔥',
        link: dto.link ?? null,
        isActive: dto.isActive ?? true,
        order: dto.order ?? 0,
        startDate: dto.startDate ? new Date(dto.startDate) : null,
        endDate: dto.endDate ? new Date(dto.endDate) : null,
      },
    });

    this.invalidateCache();
    return created;
  }

  /**
   * Update an existing announcement and invalidate caches.
   */
  async update(id: string, dto: UpdateAnnouncementDto) {
    await this.findOne(id);

    const updated = await this.prisma.announcement.update({
      where: { id },
      data: {
        ...(dto.text !== undefined && { text: dto.text }),
        ...(dto.icon !== undefined && { icon: dto.icon }),
        ...(dto.link !== undefined && { link: dto.link }),
        ...(dto.isActive !== undefined && { isActive: dto.isActive }),
        ...(dto.order !== undefined && { order: dto.order }),
        ...(dto.startDate !== undefined && {
          startDate: dto.startDate ? new Date(dto.startDate) : null,
        }),
        ...(dto.endDate !== undefined && {
          endDate: dto.endDate ? new Date(dto.endDate) : null,
        }),
      },
    });

    this.invalidateCache();
    return updated;
  }

  /**
   * Delete an announcement and invalidate caches.
   */
  async remove(id: string) {
    await this.findOne(id);

    await this.prisma.announcement.delete({
      where: { id },
    });

    this.invalidateCache();
    return { id, message: 'Announcement deleted successfully' };
  }

  /**
   * Asynchronously evict cached announcement keys without blocking the HTTP response.
   */
  private invalidateCache(): void {
    Promise.all([
      this.redis.del(CACHE_KEY_ACTIVE),
      this.redis.del(CACHE_KEY_ALL),
    ]).catch((err) => {
      this.logger.error(`Failed to evict announcements cache: ${err.message}`);
    });
  }
}
