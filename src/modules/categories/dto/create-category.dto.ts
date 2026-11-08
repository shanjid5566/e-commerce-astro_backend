// backend/src/modules/categories/dto/create-category.dto.ts
import { IsNotEmpty, IsOptional, IsString, IsUrl } from 'class-validator';

/**
 * CreateCategoryDto defines validation rules for creating a new product category.
 */
export class CreateCategoryDto {
  // Category title (e.g. "Hoodies & Sweatshirts")
  @IsString()
  @IsNotEmpty({ message: 'Category name is required' })
  name: string;

  // Custom URL slug (e.g. "hoodies") - optional, auto-generated if omitted
  @IsString()
  @IsOptional()
  slug?: string;

  // Cover image URL for the category showcase card
  @IsString()
  @IsOptional()
  image?: string;

  // Optional category description
  @IsString()
  @IsOptional()
  description?: string;
}