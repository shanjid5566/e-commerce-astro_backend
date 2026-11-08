// backend/src/modules/uploads/uploads.service.ts
import { Injectable, BadRequestException, Logger } from '@nestjs/common';
import { Request } from 'express';
import * as fs from 'fs';
import * as path from 'path';

export interface UploadedFileResponse {
  url: string;
  filename: string;
  originalName: string;
  size: number;
  mimetype: string;
}

/**
 * UploadsService processes uploaded files and generates public accessible URLs.
 */
@Injectable()
export class UploadsService {
  private readonly logger = new Logger(UploadsService.name);

  /**
   * Formats a single uploaded multer file into a standardized response with absolute URL.
   */
  formatFileResponse(file: Express.Multer.File, req: Request): UploadedFileResponse {
    if (!file) {
      throw new BadRequestException('No image file provided for upload');
    }

    // Determine host and protocol (support reverse proxy headers)
    const protocol = req.headers['x-forwarded-proto'] || req.protocol || 'http';
    const host = req.get('host') || 'localhost:3000';
    const publicUrl = `${protocol}://${host}/uploads/${file.filename}`;

    return {
      url: publicUrl,
      filename: file.filename,
      originalName: file.originalname,
      size: file.size,
      mimetype: file.mimetype,
    };
  }

  /**
   * Formats multiple uploaded multer files into an array of responses.
   */
  formatMultipleFilesResponse(
    files: Express.Multer.File[],
    req: Request,
  ): UploadedFileResponse[] {
    if (!files || files.length === 0) {
      throw new BadRequestException('No image files provided for upload');
    }

    return files.map((file) => this.formatFileResponse(file, req));
  }

  /**
   * Deletes a local file from disk.
   */
  async deleteFile(filename: string): Promise<boolean> {
    try {
      const filePath = path.join(process.cwd(), 'uploads', filename);
      if (fs.existsSync(filePath)) {
        await fs.promises.unlink(filePath);
        return true;
      }
      return false;
    } catch (err: any) {
      this.logger.error(`Failed to delete file ${filename}: ${err.message}`);
      return false;
    }
  }
}

