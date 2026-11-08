// backend/src/modules/categories/categories.service.ts
import {
  Injectable,
  NotFoundException,
  ConflictException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { RedisService } from '../../redis/redis.service';
import { CreateCategoryDto } from './dto/create-category.dto';
import { UpdateCategoryDto } from './dto/update-category.dto';

/**
 * CategoriesService handles category operations with intelligent Redis caching.
 */
@Injectable()
export class CategoriesService {
  private readonly logger = new Logger(CategoriesService.name);

  // Redis cache key for all categories
  private readonly CACHE_KEY = 'cache:categories:all';

  // 2 hours Time-To-Live in seconds
  private readonly CACHE_TTL = 7200;

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {}

  /**
   * Helper function to generate URL-safe slugs from category names.
   * Example: "Hoodies & Sweatshirts" -> "hoodies-sweatshirts"
   */
  private generateSlug(name: string): string {
    return name
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)/g, '');
  }

  /**
   * Retrieve all categories with product counts (Cached in Redis & L1 RAM for blazing-fast speed).
   */
  async findAll() {
    // 1. Check Cache (L1 Memory & L2 Redis)
    const cached = await this.redis.get<any[]>(this.CACHE_KEY);
    if (cached) {
      return cached;
    }

    // 2. Cache Miss: Fetch from PostgreSQL with product count
    const categories = await this.prisma.category.findMany({
      include: {
        _count: {
          select: { products: true },
        },
      },
      orderBy: { createdAt: 'asc' },
    });

    // Format response to include itemCount matching frontend expectations
    const formatted = categories.map((cat) => ({
      id: cat.id,
      name: cat.name,
      slug: cat.slug,
      image: cat.image,
      description: cat.description,
      itemCount: cat._count.products,
      createdAt: cat.createdAt,
    }));

    // 3. Store in Cache with TTL
    await this.redis.set(this.CACHE_KEY, formatted, this.CACHE_TTL);

    return formatted;
  }

  /**
   * Retrieve single category by slug or id.
   */
  async findBySlug(slug: string) {
    const category = await this.prisma.category.findFirst({
      where: {
        OR: [{ slug }, { id: slug }],
      },
      include: {
        _count: {
          select: { products: true },
        },
      },
    });

    if (!category) {
      throw new NotFoundException(`Category '${slug}' not found`);
    }

    return {
      id: category.id,
      name: category.name,
      slug: category.slug,
      image: category.image,
      description: category.description,
      itemCount: category._count.products,
      createdAt: category.createdAt,
    };
  }

  /**
   * Create a new category and invalidate the cache.
   */
  async create(dto: CreateCategoryDto) {
    const slug = dto.slug ? this.generateSlug(dto.slug) : this.generateSlug(dto.name);

    // Check for duplicate slug
    const existing = await this.prisma.category.findUnique({
      where: { slug },
    });

    if (existing) {
      throw new ConflictException(`Category with slug '${slug}' already exists`);
    }

    const category = await this.prisma.category.create({
      data: {
        name: dto.name,
        slug,
        image: dto.image,
        description: dto.description,
      },
    });

    // Invalidate Redis cache immediately
    await this.redis.del(this.CACHE_KEY);

    return category;
  }

  /**
   * Helper to resolve either a CUID id or URL slug to an exact database ID.
   */
  private async resolveCategoryId(idOrSlug: string): Promise<string> {
    const category = await this.prisma.category.findFirst({
      where: {
        OR: [{ id: idOrSlug }, { slug: idOrSlug }],
      },
      select: { id: true },
    });

    if (!category) {
      throw new NotFoundException(`Category '${idOrSlug}' not found`);
    }

    return category.id;
  }

  /**
   * Update an existing category and invalidate cache asynchronously.
   */
  async update(idOrSlug: string, dto: UpdateCategoryDto) {
    const targetId = await this.resolveCategoryId(idOrSlug);

    let updatedSlug = dto.slug ? this.generateSlug(dto.slug) : undefined;
    if (dto.name && !dto.slug) {
      updatedSlug = this.generateSlug(dto.name);
    }

    const updated = await this.prisma.category.update({
      where: { id: targetId },
      data: {
        name: dto.name,
        slug: updatedSlug,
        image: dto.image,
        description: dto.description,
      },
    });

    // Invalidate cache asynchronously without blocking client response
    this.redis.del(this.CACHE_KEY).catch((err) => this.logger.error('Cache purge error', err));

    return updated;
  }

  /**
   * Delete category and invalidate cache asynchronously.
   */
  async remove(idOrSlug: string) {
    const targetId = await this.resolveCategoryId(idOrSlug);

    await this.prisma.category.delete({
      where: { id: targetId },
    });

    // Non-blocking cache invalidation
    this.redis.del(this.CACHE_KEY).catch((err) => this.logger.error('Cache purge error', err));

    return { message: 'Category deleted successfully' };
  }
}
