// backend/src/modules/hero-slides/hero-slides.service.ts
import { Injectable } from '@nestjs/common';
import { ProductsService } from '../products/products.service';

/**
 * HeroSlidesService connects the hero banner endpoints with ProductsService.
 * Eliminates redundant database tables and duplicate records.
 */
@Injectable()
export class HeroSlidesService {
  constructor(private readonly productsService: ProductsService) {}

  /**
   * Fetch active hero carousel slides directly from catalog products.
   */
  async findActive() {
    return this.productsService.findHeroBannerProducts();
  }

  /**
   * Remove a product from the hero banner carousel.
   * Flips showInHeroBanner to false and evicts all relevant caches.
   */
  async removeFromBanner(productId: string) {
    await this.productsService.update(productId, {
      showInHeroBanner: false,
    });

    return {
      productId,
      showInHeroBanner: false,
      message: 'Product removed from hero banner carousel successfully',
    };
  }
}
