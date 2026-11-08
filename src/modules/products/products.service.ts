// backend/src/modules/products/products.service.ts
import {
  Injectable,
  NotFoundException,
  ConflictException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { RedisService } from '../../redis/redis.service';
import { CreateProductDto } from './dto/create-product.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import { QueryProductDto } from './dto/query-product.dto';
import { Prisma } from '@prisma/client';

/**
 * ProductsService handles full catalog operations, filtering, and multi-tier Redis caching.
 */
@Injectable()
export class ProductsService {
  private readonly logger = new Logger(ProductsService.name);
  private readonly CACHE_TTL_CATALOG = 300; // 5 minutes TTL for catalog lists
  private readonly CACHE_TTL_DETAIL = 3600; // 1 hour TTL for detail pages

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {}

  /**
   * Helper function to generate URL-safe slugs from product titles.
   */
  private generateSlug(title: string): string {
    return title
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)/g, '');
  }

  /**
   * Helper function to purge all product and category-related caches.
   */
  private async invalidateCache(): Promise<void> {
    try {
      await Promise.all([
        this.redis.invalidatePattern('cache:products:*'),
        this.redis.del('cache:categories:all'),
      ]);
    } catch (err: any) {
      this.logger.error(`Cache invalidation error: ${err.message}`);
    }
  }

  /**
   * Helper to resolve either a CUID id or URL slug to an exact database product ID.
   */
  private async resolveProductId(idOrSlug: string): Promise<string> {
    const product = await this.prisma.product.findFirst({
      where: {
        OR: [{ id: idOrSlug }, { slug: idOrSlug }],
      },
      select: { id: true },
    });

    if (!product) {
      throw new NotFoundException(`Product '${idOrSlug}' not found`);
    }

    return product.id;
  }

  /**
   * Public Catalog: Find products with filtering, search, sorting, and pagination (Cached in Redis/L1).
   */
  async findAll(query: QueryProductDto) {
    const cacheKey = `cache:products:list:${JSON.stringify(query)}`;

    // 1. Check L1 / L2 Cache
    const cached = await this.redis.get<any>(cacheKey);
    if (cached) {
      return cached;
    }

    // 2. Build Prisma dynamic where clause
    const where: Prisma.ProductWhereInput = {};

    // Filter by Category (supports category slug or category ID)
    if (query.category) {
      where.category = {
        OR: [{ slug: query.category }, { id: query.category }],
      };
    }

    // Filter by Price range
    if (query.minPrice !== undefined || query.maxPrice !== undefined) {
      where.price = {
        gte: query.minPrice,
        lte: query.maxPrice,
      };
    }

    // Search by title or description (case-insensitive)
    if (query.search) {
      where.OR = [
        { title: { contains: query.search, mode: 'insensitive' } },
        { description: { contains: query.search, mode: 'insensitive' } },
      ];
    }

    // Sorting
    let orderBy: Prisma.ProductOrderByWithRelationInput = { createdAt: 'desc' };
    if (query.sort === 'price_asc') {
      orderBy = { price: 'asc' };
    } else if (query.sort === 'price_desc') {
      orderBy = { price: 'desc' };
    } else if (query.sort === 'newest') {
      orderBy = { createdAt: 'desc' };
    }

    const page = query.page || 1;
    const limit = query.limit || 12;
    const skip = (page - 1) * limit;

    // Execute count and items queries in parallel
    const [total, products] = await Promise.all([
      this.prisma.product.count({ where }),
      this.prisma.product.findMany({
        where,
        orderBy,
        skip,
        take: limit,
        include: {
          category: {
            select: { id: true, name: true, slug: true },
          },
        },
      }),
    ]);

    const result = {
      items: products,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit) || 1,
      },
    };

    // Store in cache
    await this.redis.set(cacheKey, result, this.CACHE_TTL_CATALOG);

    return result;
  }

  /**
   * Public: Retrieve products marked for the homepage hero carousel.
   */
  async findHeroBannerProducts() {
    const cacheKey = 'cache:products:hero';
    const cached = await this.redis.get<any[]>(cacheKey);
    if (cached) return cached;

    const products = await this.prisma.product.findMany({
      where: { showInHeroBanner: true },
      include: {
        category: {
          select: { id: true, name: true, slug: true },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    await this.redis.set(cacheKey, products, this.CACHE_TTL_CATALOG);
    return products;
  }

  /**
   * Public: Retrieve featured showcase products for homepage.
   */
  async findFeaturedProducts() {
    const cacheKey = 'cache:products:featured';
    const cached = await this.redis.get<any[]>(cacheKey);
    if (cached) return cached;

    const products = await this.prisma.product.findMany({
      where: {
        OR: [{ badge: { not: null } }, { showInHeroBanner: true }],
      },
      include: {
        category: {
          select: { id: true, name: true, slug: true },
        },
      },
      take: 8,
      orderBy: { createdAt: 'desc' },
    });

    await this.redis.set(cacheKey, products, this.CACHE_TTL_CATALOG);
    return products;
  }

  /**
   * Public: Retrieve single product detail by slug or id.
   */
  async findByIdOrSlug(idOrSlug: string) {
    const cacheKey = `cache:products:detail:${idOrSlug}`;
    const cached = await this.redis.get<any>(cacheKey);
    if (cached) return cached;

    const product = await this.prisma.product.findFirst({
      where: {
        OR: [{ slug: idOrSlug }, { id: idOrSlug }],
      },
      include: {
        category: {
          select: { id: true, name: true, slug: true },
        },
      },
    });

    if (!product) {
      throw new NotFoundException(`Product '${idOrSlug}' not found`);
    }

    await this.redis.set(cacheKey, product, this.CACHE_TTL_DETAIL);
    return product;
  }

  /**
   * Admin: Create a new product.
   */
  async create(dto: CreateProductDto) {
    // 1. Verify category exists
    const category = await this.prisma.category.findFirst({
      where: {
        OR: [{ id: dto.categoryId }, { slug: dto.categoryId }],
      },
      select: { id: true },
    });

    if (!category) {
      throw new NotFoundException(`Category '${dto.categoryId}' does not exist`);
    }

    // 2. Generate slug if not provided
    const slug = dto.slug ? this.generateSlug(dto.slug) : this.generateSlug(dto.title);

    // 3. Ensure slug uniqueness
    const existing = await this.prisma.product.findUnique({
      where: { slug },
      select: { id: true },
    });

    if (existing) {
      throw new ConflictException(`Product with slug '${slug}' already exists`);
    }

    const product = await this.prisma.product.create({
      data: {
        title: dto.title,
        slug,
        description: dto.description,
        price: dto.price,
        originalPrice: dto.originalPrice,
        badge: dto.badge,
        showInHeroBanner: dto.showInHeroBanner ?? false,
        categoryId: category.id,
        images: dto.images,
        sizes: dto.sizes || ['S', 'M', 'L', 'XL', 'XXL'],
        stock: dto.stock ?? 100,
      },
      include: {
        category: {
          select: { id: true, name: true, slug: true },
        },
      },
    });

    // Invalidate caches asynchronously
    this.invalidateCache();

    return product;
  }

  /**
   * Admin: Update product details.
   */
  async update(idOrSlug: string, dto: UpdateProductDto) {
    const targetId = await this.resolveProductId(idOrSlug);

    // If categoryId is changing, verify the target category exists
    let resolvedCategoryId: string | undefined;
    if (dto.categoryId) {
      const category = await this.prisma.category.findFirst({
        where: {
          OR: [{ id: dto.categoryId }, { slug: dto.categoryId }],
        },
        select: { id: true },
      });
      if (!category) {
        throw new NotFoundException(`Category '${dto.categoryId}' does not exist`);
      }
      resolvedCategoryId = category.id;
    }

    let updatedSlug = dto.slug ? this.generateSlug(dto.slug) : undefined;
    if (dto.title && !dto.slug) {
      updatedSlug = this.generateSlug(dto.title);
    }

    const updated = await this.prisma.product.update({
      where: { id: targetId },
      data: {
        title: dto.title,
        slug: updatedSlug,
        description: dto.description,
        price: dto.price,
        originalPrice: dto.originalPrice,
        badge: dto.badge,
        showInHeroBanner: dto.showInHeroBanner,
        categoryId: resolvedCategoryId,
        images: dto.images,
        sizes: dto.sizes,
        stock: dto.stock,
      },
      include: {
        category: {
          select: { id: true, name: true, slug: true },
        },
      },
    });

    // Invalidate caches asynchronously
    this.invalidateCache();

    return updated;
  }

  /**
   * Admin: Delete product record.
   */
  async remove(idOrSlug: string) {
    const targetId = await this.resolveProductId(idOrSlug);

    await this.prisma.product.delete({
      where: { id: targetId },
    });

    // Invalidate caches asynchronously
    this.invalidateCache();

    return { message: 'Product deleted successfully' };
  }
}

