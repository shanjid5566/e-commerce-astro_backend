// backend/src/modules/orders/orders.service.ts
import {
  Injectable,
  NotFoundException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { CreateOrderDto } from './dto/create-order.dto';
import { QueryOrderDto } from './dto/query-order.dto';
import { TrackOrderDto } from './dto/track-order.dto';
import { OrderStatus, Prisma } from '@prisma/client';

@Injectable()
export class OrdersService {
  private readonly logger = new Logger(OrdersService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Helper to generate a unique human-friendly order tracking number (e.g. WC-84920).
   */
  private generateOrderNumber(): string {
    const randomDigits = Math.floor(10000 + Math.random() * 90000);
    return `WC-${randomDigits}`;
  }

  /**
   * Standardizes order record and Decimal fields for client consumption.
   */
  private formatOrder(order: any) {
    if (!order) return null;

    const items = Array.isArray(order.items)
      ? order.items.map((item: any) => ({
          ...item,
          price: Number(item.price),
          subtotal: Number(item.price) * item.quantity,
        }))
      : [];

    const subtotal = items.reduce(
      (sum: number, item: any) => sum + item.subtotal,
      0,
    );

    const totalAmount = Number(order.totalAmount);
    const deliveryFee = Math.max(0, totalAmount - subtotal);

    return {
      ...order,
      subtotal,
      deliveryFee,
      totalAmount,
      items,
    };
  }

  /**
   * Public Guest Checkout: Create a customer order atomically using Prisma $transaction.
   * Fetches real product prices from the database, enforces stock checks, and computes delivery charges.
   */
  async create(dto: CreateOrderDto) {
    return this.prisma.$transaction(async (tx) => {
      // 1. Gather all unique requested product identifiers (ID or Slug)
      const requestedIds = Array.from(
        new Set(dto.items.map((item) => item.productId)),
      );

      const products = await tx.product.findMany({
        where: {
          OR: [{ id: { in: requestedIds } }, { slug: { in: requestedIds } }],
        },
        select: {
          id: true,
          slug: true,
          title: true,
          price: true,
          inStock: true,
          images: true,
        },
      });

      // Map products by both id and slug for O(1) resolution
      const productMap = new Map<string, (typeof products)[0]>();
      for (const p of products) {
        productMap.set(p.id, p);
        productMap.set(p.slug, p);
      }

      // 2. Validate all items exist and are in stock
      for (const item of dto.items) {
        const product = productMap.get(item.productId);
        if (!product) {
          throw new BadRequestException(
            `Product with identifier '${item.productId}' was not found.`,
          );
        }

        if (product.inStock === false) {
          throw new BadRequestException(
            `Product '${product.title}' is currently out of stock.`,
          );
        }
      }

      // 3. Calculate financial totals using authoritative database prices
      let subtotal = 0;
      const orderItemsData = dto.items.map((item) => {
        const product = productMap.get(item.productId)!;
        const priceNum = Number(product.price);
        subtotal += priceNum * item.quantity;

        return {
          productId: product.id,
          title: product.title,
          size: item.size,
          quantity: item.quantity,
          price: product.price,
        };
      });

      // Free delivery across Bangladesh for orders >= 2,500 BDT, otherwise 70 BDT
      const deliveryFee = subtotal >= 2500 ? 0 : 70;
      const totalAmount = subtotal + deliveryFee;

      // 4. Generate collision-resistant order number
      let orderNumber = this.generateOrderNumber();
      let exists = await tx.order.findUnique({ where: { orderNumber } });
      let retries = 0;
      while (exists && retries < 5) {
        orderNumber = this.generateOrderNumber();
        exists = await tx.order.findUnique({ where: { orderNumber } });
        retries++;
      }

      // 5. Persist order and nested order items atomically
      const order = await tx.order.create({
        data: {
          orderNumber,
          customerName: dto.customerName.trim(),
          phone: dto.phone.trim(),
          address: dto.address.trim(),
          city: dto.city.trim(),
          totalAmount,
          paymentMethod: dto.paymentMethod || 'Cash on Delivery',
          status: OrderStatus.PENDING,
          items: {
            create: orderItemsData,
          },
        },
        include: {
          items: true,
        },
      });

      this.logger.log(
        `New order placed: ${order.orderNumber} by ${order.customerName} (Total: ৳${totalAmount})`,
      );

      return this.formatOrder(order);
    });
  }

  /**
   * Public Order Tracking: Track delivery status using order number and phone.
   */
  async track(dto: TrackOrderDto) {
    const cleanOrderNumber = dto.orderNumber.trim().toUpperCase();

    const order = await this.prisma.order.findUnique({
      where: { orderNumber: cleanOrderNumber },
      include: {
        items: true,
      },
    });

    if (!order) {
      throw new NotFoundException(
        `No order found with order number '${cleanOrderNumber}'. Please verify your details.`,
      );
    }

    // Optional phone number verification for customer privacy
    if (dto.phone) {
      const cleanPhoneInput = dto.phone.replace(/[^0-9]/g, '');
      const cleanOrderPhone = order.phone.replace(/[^0-9]/g, '');
      if (
        cleanPhoneInput &&
        cleanOrderPhone &&
        !cleanOrderPhone.endsWith(cleanPhoneInput.slice(-10))
      ) {
        throw new NotFoundException(
          'Order number and phone number do not match.',
        );
      }
    }

    const formatted = this.formatOrder(order);

    // Build visual progress timeline for storefront OrderTracker component
    const timeline = [
      {
        step: 1,
        title: 'Order Placed & Confirmed',
        description: 'Order registered via Cash on Delivery.',
        completed: true,
        current: order.status === OrderStatus.PENDING,
        timestamp: order.createdAt,
      },
      {
        step: 2,
        title: 'Quality Inspection & Packing',
        description:
          'Apparel passed fabric inspection and packed into protective sleeve.',
        completed: (
          [
            OrderStatus.PROCESSING,
            OrderStatus.SHIPPED,
            OrderStatus.DELIVERED,
          ] as OrderStatus[]
        ).includes(order.status),
        current: order.status === OrderStatus.PROCESSING,
      },
      {
        step: 3,
        title: 'In Transit / Courier Dispatched',
        description:
          'Package handed over to domestic express courier delivery.',
        completed: (
          [OrderStatus.SHIPPED, OrderStatus.DELIVERED] as OrderStatus[]
        ).includes(order.status),
        current: order.status === OrderStatus.SHIPPED,
      },
      {
        step: 4,
        title: 'Delivered',
        description: 'Parcel successfully delivered to recipient.',
        completed: order.status === OrderStatus.DELIVERED,
        current: order.status === OrderStatus.DELIVERED,
      },
    ];

    return {
      ...formatted,
      timeline,
    };
  }

  /**
   * Admin: List all orders with status filtering, search, and pagination.
   */
  async findAllAdmin(query: QueryOrderDto) {
    const where: Prisma.OrderWhereInput = {};

    if (query.status) {
      where.status = query.status;
    }

    if (query.search) {
      const search = query.search.trim();
      where.OR = [
        { orderNumber: { contains: search, mode: 'insensitive' } },
        { customerName: { contains: search, mode: 'insensitive' } },
        { phone: { contains: search } },
        { city: { contains: search, mode: 'insensitive' } },
      ];
    }

    const page = query.page || 1;
    const limit = query.limit || 10;
    const skip = (page - 1) * limit;

    const [total, orders] = await Promise.all([
      this.prisma.order.count({ where }),
      this.prisma.order.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
        include: {
          items: true,
        },
      }),
    ]);

    return {
      items: orders.map((o) => this.formatOrder(o)),
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit) || 1,
      },
    };
  }

  /**
   * Admin: Retrieve a single order by ID or order number.
   */
  async findOneAdmin(idOrOrderNumber: string) {
    const order = await this.prisma.order.findFirst({
      where: {
        OR: [{ id: idOrOrderNumber }, { orderNumber: idOrOrderNumber }],
      },
      include: {
        items: true,
      },
    });

    if (!order) {
      throw new NotFoundException(
        `Order '${idOrOrderNumber}' was not found.`,
      );
    }

    return this.formatOrder(order);
  }

  /**
   * Admin: Update the fulfillment status of an order.
   */
  async updateStatus(idOrOrderNumber: string, status: OrderStatus) {
    const target = await this.findOneAdmin(idOrOrderNumber);

    const updated = await this.prisma.order.update({
      where: { id: target.id },
      data: { status },
      include: {
        items: true,
      },
    });

    this.logger.log(
      `Order ${updated.orderNumber} status changed: ${target.status} -> ${status}`,
    );

    return this.formatOrder(updated);
  }
}
