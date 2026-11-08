// backend/src/modules/categories/categories.controller.ts
import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Body,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { CategoriesService } from './categories.service';
import { CreateCategoryDto } from './dto/create-category.dto';
import { UpdateCategoryDto } from './dto/update-category.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

/**
 * CategoriesController handles public storefront and admin category management.
 * Route prefix: /api/v1/categories
 */
@Controller('categories')
export class CategoriesController {
  constructor(private readonly categoriesService: CategoriesService) {}

  /**
   * 1. Public: Retrieve all categories (Blazing fast via Redis Cache).
   * GET /api/v1/categories
   */
  @Get()
  async findAll() {
    return this.categoriesService.findAll();
  }

  /**
   * 2. Public: Retrieve single category by slug or id.
   * GET /api/v1/categories/:slug
   * 
   */
  @Get(':slug')
  async findBySlug(@Param('slug') slug: string) {
    return this.categoriesService.findBySlug(slug);
  }

  /**
   * 3. Admin Only: Create new category and clear Redis cache.
   * POST /api/v1/categories
   * 
   */
  @Post()
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.CREATED)
  async create(@Body() createCategoryDto: CreateCategoryDto) {
    return this.categoriesService.create(createCategoryDto);
  }

  /**
   * 4. Admin Only: Update category details.
   * PATCH /api/v1/categories/:id
   */
  @Patch(':id')
  @UseGuards(JwtAuthGuard)
  async update(
    @Param('id') id: string,
    @Body() updateCategoryDto: UpdateCategoryDto,
  ) {
    return this.categoriesService.update(id, updateCategoryDto);
  }

  /**
   * 5. Admin Only: Delete category.
   * DELETE /api/v1/categories/:id
   */
  @Delete(':id')
  @UseGuards(JwtAuthGuard)
  async remove(@Param('id') id: string) {
    return this.categoriesService.remove(id);
  }
}