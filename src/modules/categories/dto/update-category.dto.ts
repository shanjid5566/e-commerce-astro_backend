// backend/src/modules/categories/dto/update-category.dto.ts
import { IsOptional, IsString } from 'class-validator';

/**
 * UpdateCategoryDto allows partial updates to an existing category.
 */
export class UpdateCategoryDto {
  @IsString()
  @IsOptional()
  name?: string;

  @IsString()
  @IsOptional()
  slug?: string;

  @IsString()
  @IsOptional()
  image?: string;

  @IsString()
  @IsOptional()
  description?: string;
}