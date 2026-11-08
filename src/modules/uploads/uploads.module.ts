// backend/src/modules/uploads/uploads.module.ts
import { Module } from '@nestjs/common';
import { UploadsService } from './uploads.service';
import { UploadsController } from './uploads.controller';
import { AuthModule } from '../auth/auth.module';

/**
 * UploadsModule encapsulates all file upload and media management capabilities.
 */
@Module({
  imports: [AuthModule],
  controllers: [UploadsController],
  providers: [UploadsService],
  exports: [UploadsService],
})
export class UploadsModule {}

