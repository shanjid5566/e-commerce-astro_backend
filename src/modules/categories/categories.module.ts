// backend/src/modules/categories/categories.module.ts
import { Module } from '@nestjs/common';
import { CategoriesService } from './categories.service';
import { CategoriesController } from './categories.controller';
import { AuthModule } from '../auth/auth.module';

/**
 * CategoriesModule encapsulates category features.
 * Imports AuthModule to gain access to JwtAuthGuard for route protection.
 */
@Module({
  imports: [AuthModule],
  controllers: [CategoriesController],
  providers: [CategoriesService],
  exports: [CategoriesService], // Exported so ProductsModule can validate category existence
})
export class CategoriesModule {}