// backend/src/modules/products/dto/create-product.dto.ts
import {
  IsNotEmpty,
  IsString,
  IsNumber,
  Min,
  IsOptional,
  IsBoolean,
  IsArray,
  ArrayMinSize,
  IsInt,
} from 'class-validator';
import { Type } from 'class-transformer';

/**
 * CreateProductDto validates payload for creating a new store product.
 */
export class CreateProductDto {
  @IsString()
  @IsNotEmpty({ message: 'Product title is required' })
  title: string;

  @IsString()
  @IsOptional()
  slug?: string;

  @IsString()
  @IsNotEmpty({ message: 'Product description is required' })
  description: string;

  @Type(() => Number)
  @IsNumber({}, { message: 'Price must be a valid number' })
  @Min(0, { message: 'Price must be non-negative' })
  price: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({}, { message: 'Original price must be a valid number' })
  @Min(0, { message: 'Original price must be non-negative' })
  originalPrice?: number;

  @IsOptional()
  @IsString()
  badge?: string; // e.g. "Best Seller", "New Arrival", "Winter Warmth"

  @IsOptional()
  @IsBoolean()
  isFeatured?: boolean = false;

  @IsOptional()
  @IsBoolean()
  showInHeroBanner?: boolean = false;

  @IsOptional()
  @IsString()
  heroSubtitle?: string;

  @IsString()
  @IsNotEmpty({ message: 'Valid categoryId is required' })
  categoryId: string;

  @IsArray({ message: 'Images must be an array of image URLs' })
  @ArrayMinSize(1, { message: 'At least one product image is required' })
  @IsString({ each: true, message: 'Each image must be a valid URL string' })
  images: string[];

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  primaryImageIndex?: number;

  @IsOptional()
  @IsString()
  primaryImage?: string;

  @IsOptional()
  @IsArray({ message: 'Sizes must be an array of strings' })
  @IsString({ each: true })
  sizes?: string[] = ['S', 'M', 'L', 'XL', 'XXL'];

  @IsOptional()
  @IsBoolean()
  inStock?: boolean = true;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  stock?: number = 100;
}
