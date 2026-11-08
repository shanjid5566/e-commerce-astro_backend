// backend/src/modules/hero-slides/hero-slides.controller.ts
import { Controller, Get, Delete, Param, UseGuards } from '@nestjs/common';
import { HeroSlidesService } from './hero-slides.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

/**
 * HeroSlidesController manages the homepage top carousel slides.
 * All slides are dynamically derived from products where showInHeroBanner = true.
 */
@Controller('hero-slides')
export class HeroSlidesController {
  constructor(private readonly heroSlidesService: HeroSlidesService) {}

  /**
   * 1. Public & Admin: Fetch active hero slides for the homepage carousel.
   * GET /api/v1/hero-slides
   */
  @Get()
  findActive() {
    return this.heroSlidesService.findActive();
  }

  /**
   * 2. Admin Only: Remove a product from the hero banner carousel.
   * Flips product's showInHeroBanner to false without deleting the catalog product.
   * DELETE /api/v1/hero-slides/:productId
   */
  @UseGuards(JwtAuthGuard)
  @Delete(':productId')
  removeFromBanner(@Param('productId') productId: string) {
    return this.heroSlidesService.removeFromBanner(productId);
  }
}
