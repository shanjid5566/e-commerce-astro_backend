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
   * Reorders image array to ensure the designated primary image is always at index 0.
   */
  private arrangeImages(
    images: string[],
    primaryIndex?: number,
    primaryUrl?: string,
  ): string[] {
    if (!images || images.length <= 1) return images || [];
    const copy = [...images];

    if (
      typeof primaryIndex === 'number' &&
      primaryIndex >= 0 &&
      primaryIndex < copy.length
    ) {
      const [primary] = copy.splice(primaryIndex, 1);
      copy.unshift(primary);
      return copy;
    }

    if (primaryUrl && copy.includes(primaryUrl)) {
      return [primaryUrl, ...copy.filter((img) => img !== primaryUrl)];
    }

    return copy;
  }

  /**
   * Standardizes product data for storefront consumption.
   * Maps images[0] to the primary 'image' property and serializes Decimals to Numbers.
   */
  private formatProduct(product: any) {
    if (!product) return null;
    const images = Array.isArray(product.images) ? product.images : [];
    return {
      ...product,
      price: product.price ? Number(product.price) : 0,
      originalPrice: product.originalPrice ? Number(product.originalPrice) : null,
      image: images[0] || '', // Primary thumbnail is always index 0
      images,
      inStock: product.inStock !== undefined ? product.inStock : product.stock > 0,
      heroSubtitle: product.heroSubtitle || product.title,
    };
  }

  /**
   * Helper function to purge all product and category-related caches.
   */
  private async invalidateCache(): Promise<void> {
    try {
      await Promise.all([
        this.redis.del('cache:products:hero'),
        this.redis.del('cache:products:featured'),
        this.redis.del('cache:categories:all'),
        this.redis.invalidatePattern('cache:products:*'),
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
      items: products.map((p) => this.formatProduct(p)),
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

    const formatted = products.map((p) => this.formatProduct(p));
    await this.redis.set(cacheKey, formatted, this.CACHE_TTL_CATALOG);
    return formatted;
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
        OR: [
          { isFeatured: true },
          { badge: { not: null } },
          { showInHeroBanner: true },
        ],
      },
      include: {
        category: {
          select: { id: true, name: true, slug: true },
        },
      },
      take: 8,
      orderBy: { createdAt: 'desc' },
    });

    const formatted = products.map((p) => this.formatProduct(p));
    await this.redis.set(cacheKey, formatted, this.CACHE_TTL_CATALOG);
    return formatted;
  }

  /**
   * Public: Retrieve a single product by its unique slug or CUID id.
   */
  async findByIdOrSlug(idOrSlug: string) {
    return this.findOne(idOrSlug);
  }

  async findOne(idOrSlug: string) {
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

    const formatted = this.formatProduct(product);
    await this.redis.set(cacheKey, formatted, this.CACHE_TTL_DETAIL);
    return formatted;
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

    // 4. Arrange primary image at index 0
    const finalImages = this.arrangeImages(
      dto.images,
      dto.primaryImageIndex,
      dto.primaryImage,
    );

    const product = await this.prisma.product.create({
      data: {
        title: dto.title,
        slug,
        description: dto.description,
        price: dto.price,
        originalPrice: dto.originalPrice,
        badge: dto.badge,
        isFeatured: dto.isFeatured ?? false,
        showInHeroBanner: dto.showInHeroBanner ?? false,
        heroSubtitle: dto.heroSubtitle || dto.title,
        categoryId: category.id,
        images: finalImages,
        sizes: dto.sizes || ['S', 'M', 'L', 'XL', 'XXL'],
        inStock: dto.inStock ?? true,
        stock: dto.stock ?? (dto.inStock === false ? 0 : 100),
      },
      include: {
        category: {
          select: { id: true, name: true, slug: true },
        },
      },
    });

    // Invalidate caches asynchronously
    this.invalidateCache();

    return this.formatProduct(product);
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

    // Arrange images if provided or if primary image selection changed
    let finalImages: string[] | undefined;
    if (dto.images) {
      finalImages = this.arrangeImages(
        dto.images,
        dto.primaryImageIndex,
        dto.primaryImage,
      );
    } else if (
      dto.primaryImageIndex !== undefined ||
      dto.primaryImage !== undefined
    ) {
      const current = await this.prisma.product.findUnique({
        where: { id: targetId },
        select: { images: true },
      });
      if (current?.images) {
        finalImages = this.arrangeImages(
          current.images,
          dto.primaryImageIndex,
          dto.primaryImage,
        );
      }
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
        isFeatured: dto.isFeatured,
        showInHeroBanner: dto.showInHeroBanner,
        heroSubtitle: dto.heroSubtitle,
        categoryId: resolvedCategoryId,
        images: finalImages,
        sizes: dto.sizes,
        inStock: dto.inStock,
        stock: dto.stock ?? (dto.inStock === false ? 0 : undefined),
      },
      include: {
        category: {
          select: { id: true, name: true, slug: true },
        },
      },
    });

    // Invalidate caches asynchronously
    this.invalidateCache();

    return this.formatProduct(updated);
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
