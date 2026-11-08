// backend/src/modules/orders/orders.controller.ts
import {
  Controller,
  Get,
  Post,
  Patch,
  Param,
  Body,
  Query,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { OrdersService } from './orders.service';
import { CreateOrderDto } from './dto/create-order.dto';
import { QueryOrderDto } from './dto/query-order.dto';
import { TrackOrderDto } from './dto/track-order.dto';
import { UpdateOrderStatusDto } from './dto/update-order-status.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@Controller('orders')
export class OrdersController {
  constructor(private readonly ordersService: OrdersService) {}

  /**
   * 1. Public: Guest Customer Checkout.
   * Atomic Prisma $transaction creating order, validating stock, calculating delivery charge.
   * POST /api/v1/orders
   */
  @Post()
  @HttpCode(HttpStatus.CREATED)
  create(@Body() dto: CreateOrderDto) {
    return this.ordersService.create(dto);
  }

  /**
   * 2. Public: Live Order Parcel Tracking.
   * GET /api/v1/orders/track?orderNumber=WC-84920&phone=017...
   */
  @Get('track')
  track(@Query() dto: TrackOrderDto) {
    return this.ordersService.track(dto);
  }

  /**
   * 3. Admin Only: List all customer orders with status filter, search, and pagination.
   * GET /api/v1/orders
   */
  @UseGuards(JwtAuthGuard)
  @Get()
  findAllAdmin(@Query() query: QueryOrderDto) {
    return this.ordersService.findAllAdmin(query);
  }

  /**
   * 4. Admin Only: Retrieve single order details.
   * GET /api/v1/orders/:idOrOrderNumber
   */
  @UseGuards(JwtAuthGuard)
  @Get(':idOrOrderNumber')
  findOneAdmin(@Param('idOrOrderNumber') idOrOrderNumber: string) {
    return this.ordersService.findOneAdmin(idOrOrderNumber);
  }

  /**
   * 5. Admin Only: Update order fulfillment status.
   * PATCH /api/v1/orders/:idOrOrderNumber/status
   */
  @UseGuards(JwtAuthGuard)
  @Patch(':idOrOrderNumber/status')
  updateStatus(
    @Param('idOrOrderNumber') idOrOrderNumber: string,
    @Body() dto: UpdateOrderStatusDto,
  ) {
    return this.ordersService.updateStatus(idOrOrderNumber, dto.status);
  }
}
