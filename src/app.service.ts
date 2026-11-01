import { Injectable } from '@nestjs/common';

@Injectable()
export class AppService {
  getHello(): { status: string; message: string; timestamp: string } {
    return {
      status: 'success',
      message: 'WinterCart E-Commerce API is running smoothly.',
      timestamp: new Date().toISOString(),
    };
  }
}

