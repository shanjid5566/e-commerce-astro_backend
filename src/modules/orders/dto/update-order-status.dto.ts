// backend/src/modules/orders/dto/update-order-status.dto.ts
import { IsEnum, IsNotEmpty } from 'class-validator';
import { OrderStatus } from '@prisma/client';

export class UpdateOrderStatusDto {
  @IsNotEmpty({ message: 'Order status is required' })
  @IsEnum(OrderStatus, {
    message: 'Status must be one of: PENDING, PROCESSING, SHIPPED, DELIVERED, CANCELLED',
  })
  status: OrderStatus;
}
