// backend/src/modules/products/products.controller.ts
import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Body,
  Query,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ProductsService } from './products.service';
import { CreateProductDto } from './dto/create-product.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import { QueryProductDto } from './dto/query-product.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

/**
 * ProductsController handles public catalog browsing and administrative product management.
 * Route prefix: /api/v1/products
 */
@Controller('products')
export class ProductsController {
  constructor(private readonly productsService: ProductsService) {}

  /**
   * 1. Public: Query product catalog with search, filters, pagination, and sorting.
   * GET /api/v1/products
   */
  @Get()
  async findAll(@Query() query: QueryProductDto) {
    return this.productsService.findAll(query);
  }

  /**
   * 2. Public: Retrieve products featured in the homepage hero carousel.
   * GET /api/v1/products/hero-banner
   */
  @Get('hero-banner')
  async findHeroBannerProducts() {
    return this.productsService.findHeroBannerProducts();
  }

  /**
   * 3. Public: Retrieve featured showcase products for homepage.
   * GET /api/v1/products/featured
   */
  @Get('featured')
  async findFeaturedProducts() {
    return this.productsService.findFeaturedProducts();
  }

  /**
   * 4. Public: Retrieve single product details by id or slug.
   * GET /api/v1/products/:idOrSlug
   */
  @Get(':idOrSlug')
  async findOne(@Param('idOrSlug') idOrSlug: string) {
    return this.productsService.findByIdOrSlug(idOrSlug);
  }

  /**
   * 5. Admin: Create a new product.
   * POST /api/v1/products
   */
  @Post()
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.CREATED)
  async create(@Body() createProductDto: CreateProductDto) {
    return this.productsService.create(createProductDto);
  }

  /**
   * 6. Admin: Update product details.
   * PATCH /api/v1/products/:id
   */
  @Patch(':id')
  @UseGuards(JwtAuthGuard)
  async update(
    @Param('id') id: string,
    @Body() updateProductDto: UpdateProductDto,
  ) {
    return this.productsService.update(id, updateProductDto);
  }

  /**
   * 7. Admin: Delete product record.
   * DELETE /api/v1/products/:id
   */
  @Delete(':id')
  @UseGuards(JwtAuthGuard)
  async remove(@Param('id') id: string) {
    return this.productsService.remove(id);
  }
}

