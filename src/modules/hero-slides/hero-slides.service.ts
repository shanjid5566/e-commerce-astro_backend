// backend/src/modules/hero-slides/hero-slides.service.ts
import { Injectable, NotFoundException, Logger } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { RedisService } from '../../redis/redis.service';
import { CreateHeroSlideDto } from './dto/create-hero-slide.dto';
import { UpdateHeroSlideDto } from './dto/update-hero-slide.dto';

const CACHE_KEY_ACTIVE = 'cache:hero-slides:active';
const CACHE_KEY_ALL = 'cache:hero-slides:all';
const CACHE_TTL_SECONDS = 1800; // 30 minutes

@Injectable()
export class HeroSlidesService {
  private readonly logger = new Logger(HeroSlidesService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {}

  /**
   * Fetch active hero slides for storefront homepage carousel.
   * Leverages multi-tier caching for sub-millisecond responses.
   */
  async findActive() {
    const cached = await this.redis.get<any[]>(CACHE_KEY_ACTIVE);
    if (cached) {
      return cached;
    }

    const slides = await this.prisma.heroSlide.findMany({
      where: { isActive: true },
      include: {
        product: {
          select: {
            id: true,
            title: true,
            slug: true,
            price: true,
            originalPrice: true,
            images: true,
          },
        },
      },
      orderBy: [{ order: 'asc' }, { createdAt: 'desc' }],
    });

    const formatted = slides.map((slide) => this.formatSlide(slide));
    await this.redis.set(CACHE_KEY_ACTIVE, formatted, CACHE_TTL_SECONDS);
    return formatted;
  }

  /**
   * Fetch all hero slides for admin management dashboard.
   */
  async findAllAdmin() {
    const cached = await this.redis.get<any[]>(CACHE_KEY_ALL);
    if (cached) {
      return cached;
    }

    const slides = await this.prisma.heroSlide.findMany({
      include: {
        product: {
          select: {
            id: true,
            title: true,
            slug: true,
            price: true,
            originalPrice: true,
            images: true,
          },
        },
      },
      orderBy: [{ order: 'asc' }, { createdAt: 'desc' }],
    });

    const formatted = slides.map((slide) => this.formatSlide(slide));
    await this.redis.set(CACHE_KEY_ALL, formatted, CACHE_TTL_SECONDS);
    return formatted;
  }

  /**
   * Fetch a single hero slide by ID.
   */
  async findOne(id: string) {
    const slide = await this.prisma.heroSlide.findUnique({
      where: { id },
      include: {
        product: {
          select: {
            id: true,
            title: true,
            slug: true,
            price: true,
            originalPrice: true,
            images: true,
          },
        },
      },
    });

    if (!slide) {
      throw new NotFoundException(`Hero slide with ID '${id}' not found`);
    }

    return this.formatSlide(slide);
  }

  /**
   * Create a new hero slide and evict caches asynchronously.
   */
  async create(dto: CreateHeroSlideDto) {
    if (dto.productId) {
      const product = await this.prisma.product.findUnique({
        where: { id: dto.productId },
        select: { id: true },
      });
      if (!product) {
        throw new NotFoundException(`Linked product with ID '${dto.productId}' not found`);
      }
    }

    const created = await this.prisma.heroSlide.create({
      data: {
        tag: dto.tag,
        title: dto.title,
        subtitle: dto.subtitle,
        image: dto.image,
        price: dto.price,
        order: dto.order ?? 0,
        isActive: dto.isActive ?? true,
        productId: dto.productId ?? null,
      },
      include: {
        product: {
          select: {
            id: true,
            title: true,
            slug: true,
            price: true,
            originalPrice: true,
            images: true,
          },
        },
      },
    });

    this.invalidateCache();
    return this.formatSlide(created);
  }

  /**
   * Update an existing hero slide and evict caches asynchronously.
   */
  async update(id: string, dto: UpdateHeroSlideDto) {
    await this.findOne(id);

    if (dto.productId) {
      const product = await this.prisma.product.findUnique({
        where: { id: dto.productId },
        select: { id: true },
      });
      if (!product) {
        throw new NotFoundException(`Linked product with ID '${dto.productId}' not found`);
      }
    }

    const updated = await this.prisma.heroSlide.update({
      where: { id },
      data: {
        ...(dto.tag !== undefined && { tag: dto.tag }),
        ...(dto.title !== undefined && { title: dto.title }),
        ...(dto.subtitle !== undefined && { subtitle: dto.subtitle }),
        ...(dto.image !== undefined && { image: dto.image }),
        ...(dto.price !== undefined && { price: dto.price }),
        ...(dto.order !== undefined && { order: dto.order }),
        ...(dto.isActive !== undefined && { isActive: dto.isActive }),
        ...(dto.productId !== undefined && { productId: dto.productId }),
      },
      include: {
        product: {
          select: {
            id: true,
            title: true,
            slug: true,
            price: true,
            originalPrice: true,
            images: true,
          },
        },
      },
    });

    this.invalidateCache();
    return this.formatSlide(updated);
  }

  /**
   * Delete a hero slide and evict caches asynchronously.
   */
  async remove(id: string) {
    await this.findOne(id);

    await this.prisma.heroSlide.delete({
      where: { id },
    });

    this.invalidateCache();
    return { id, message: 'Hero slide deleted successfully' };
  }

  /**
   * Normalize Decimal database fields into native JavaScript numbers.
   */
  private formatSlide(slide: any) {
    return {
      ...slide,
      price: slide.price ? Number(slide.price) : 0,
      product: slide.product
        ? {
            ...slide.product,
            price: Number(slide.product.price),
            originalPrice: slide.product.originalPrice
              ? Number(slide.product.originalPrice)
              : null,
          }
        : null,
    };
  }

  /**
   * Asynchronously evict cached hero slide keys without blocking the HTTP response.
   */
  private invalidateCache(): void {
    Promise.all([
      this.redis.del(CACHE_KEY_ACTIVE),
      this.redis.del(CACHE_KEY_ALL),
    ]).catch((err) => {
      this.logger.error(`Failed to evict hero slides cache: ${err.message}`);
    });
  }
}

