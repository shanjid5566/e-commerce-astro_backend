// backend/src/modules/orders/dto/track-order.dto.ts
import { IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class TrackOrderDto {
  @IsString()
  @IsNotEmpty({ message: 'Order number is required (e.g. WC-84920)' })
  orderNumber: string;

  @IsOptional()
  @IsString()
  phone?: string;
}
