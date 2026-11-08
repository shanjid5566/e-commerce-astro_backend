// backend/src/modules/uploads/uploads.controller.ts
import {
  Controller,
  Post,
  UseInterceptors,
  UploadedFile,
  UploadedFiles,
  UseGuards,
  Req,
  BadRequestException,
} from '@nestjs/common';
import { FileInterceptor, FilesInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { extname, join } from 'path';
import * as fs from 'fs';
import * as os from 'os';
import { Request } from 'express';
import { UploadsService } from './uploads.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

/**
 * Determine the uploads storage directory.
 * In serverless environments (e.g. AWS Lambda / Vercel), /var/task is read-only,
 * so we fall back to os.tmpdir() (/tmp).
 */
const getUploadDir = (): string => {
  if (process.env.VERCEL) {
    return join(os.tmpdir(), 'uploads');
  }
  return join(process.cwd(), 'uploads');
};

const UPLOAD_DIR = getUploadDir();

// Ensure the local uploads directory exists safely without crashing serverless boots
try {
  if (!fs.existsSync(UPLOAD_DIR)) {
    fs.mkdirSync(UPLOAD_DIR, { recursive: true });
  }
} catch {
  // Read-only filesystem safeguard for serverless environments
}

// Multer storage configuration with collision-resistant naming
const multerStorage = diskStorage({
  destination: (req, file, cb) => {
    try {
      if (!fs.existsSync(UPLOAD_DIR)) {
        fs.mkdirSync(UPLOAD_DIR, { recursive: true });
      }
    } catch {
      // Ignore directory creation errors in serverless
    }
    cb(null, UPLOAD_DIR);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
    const ext = extname(file.originalname).toLowerCase();
    cb(null, `${uniqueSuffix}${ext}`);
  },
});

// Image file format filter
const imageFileFilter = (req: any, file: Express.Multer.File, cb: any) => {
  const allowedMimeTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
  if (!allowedMimeTypes.includes(file.mimetype)) {
    return cb(
      new BadRequestException(
        'Invalid file type. Only JPEG, PNG, WEBP, and GIF images are allowed.',
      ),
      false,
    );
  }
  cb(null, true);
};

// 5MB maximum file size
const multerLimits = {
  fileSize: 5 * 1024 * 1024,
};

/**
 * UploadsController provides dedicated image upload endpoints for products, categories, and banners.
 * Route prefix: /api/v1/uploads
 */
@Controller('uploads')
export class UploadsController {
  constructor(private readonly uploadsService: UploadsService) {}

  /**
   * Upload single image (field name: 'file')
   * POST /api/v1/uploads/image
   */
  @Post('image')
  @UseGuards(JwtAuthGuard)
  @UseInterceptors(
    FileInterceptor('file', {
      storage: multerStorage,
      fileFilter: imageFileFilter,
      limits: multerLimits,
    }),
  )
  uploadSingleImage(
    @UploadedFile() file: Express.Multer.File,
    @Req() req: Request,
  ) {
    return this.uploadsService.formatFileResponse(file, req);
  }

  /**
   * Upload multiple images (up to 10 files, field name: 'files')
   * POST /api/v1/uploads/images
   */
  @Post('images')
  @UseGuards(JwtAuthGuard)
  @UseInterceptors(
    FilesInterceptor('files', 10, {
      storage: multerStorage,
      fileFilter: imageFileFilter,
      limits: multerLimits,
    }),
  )
  uploadMultipleImages(
    @UploadedFiles() files: Express.Multer.File[],
    @Req() req: Request,
  ) {
    return this.uploadsService.formatMultipleFilesResponse(files, req);
  }
}
