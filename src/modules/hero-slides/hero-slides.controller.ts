// backend/src/modules/hero-slides/hero-slides.controller.ts
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
import { HeroSlidesService } from './hero-slides.service';
import { CreateHeroSlideDto } from './dto/create-hero-slide.dto';
import { UpdateHeroSlideDto } from './dto/update-hero-slide.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@Controller('hero-slides')
export class HeroSlidesController {
  constructor(private readonly heroSlidesService: HeroSlidesService) {}

  /**
   * Public: Fetch active hero slides for the homepage carousel.
   */
  @Get()
  findActive() {
    return this.heroSlidesService.findActive();
  }

  /**
   * Admin: Fetch all hero slides for admin management.
   */
  @UseGuards(JwtAuthGuard)
  @Get('admin')
  findAllAdmin() {
    return this.heroSlidesService.findAllAdmin();
  }

  /**
   * Admin: Fetch a single hero slide by ID.
   */
  @UseGuards(JwtAuthGuard)
  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.heroSlidesService.findOne(id);
  }

  /**
   * Admin: Create a new hero slide.
   */
  @UseGuards(JwtAuthGuard)
  @Post()
  @HttpCode(HttpStatus.CREATED)
  create(@Body() dto: CreateHeroSlideDto) {
    return this.heroSlidesService.create(dto);
  }

  /**
   * Admin: Update an existing hero slide.
   */
  @UseGuards(JwtAuthGuard)
  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateHeroSlideDto) {
    return this.heroSlidesService.update(id, dto);
  }

  /**
   * Admin: Delete a hero slide.
   */
  @UseGuards(JwtAuthGuard)
  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.heroSlidesService.remove(id);
  }
}

