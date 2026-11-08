# WinterCart E-Commerce — Backend Architecture & Implementation Plan

> **Note for AI Assistant / Agent in Any New Chat:**
> Please read this document carefully before doing any work! This file serves as the Single Source of Truth (SSOT) for the project. 
> 
> ### Working Rules (Strict):
> 1. **Do NOT edit or write application code directly in files.**
> 2. Present all code in the chat panel step-by-step so the user can understand and type it into their editor manually.
> 3. Provide **both English and Bangla comments** in code snippets.
> 4. Keep the **chat communication language in Bengali (Bangla)**.
> 5. Wait for the user to understand, ask questions, write the code, and confirm before advancing to the next step.

---

## 1. Project Overview & Context

- **Brand**: WinterCart (Specialized Winter Clothing & Streetwear in Bangladesh).
- **Frontend**: Astro 5 + React 19 + Tailwind CSS + Lucide Icons (Complete).
- **Backend**: NestJS 11 + TypeScript 5.7 + PostgreSQL + Prisma ORM + Redis (ioredis).
- **Customer Model**: **Admin-Only Authentication**. Customers **do not** log in. All storefront purchases are **Guest Checkout** with **Cash on Delivery (COD)**.

---

## 2. The 7-Layer NestJS Request Lifecycle Architecture

```
[ Frontend Request (HTTP / REST) ]
               │
               ▼
      1. 🛡️ Middlewares 
         (CORS for localhost:4321, JSON body parsing, logger)
               │
               ▼
      2. 🔒 Guards 
         (Authentication & Authorization: JwtAuthGuard for Admin endpoints)
               │
               ▼
      3. ⚡ Interceptors (Pre-Controller)
         (Request tracking, timing, header analysis)
               │
               ▼
      4. 🚰 Pipes 
         (Data Validation & Transformation: ValidationPipe with class-validator DTOs)
               │
               ▼
      5. 🎮 Controller & ⚙️ Service 
         (Business Logic execution, Redis caching, Prisma database queries)
               │
               ▼
      6. ⚡ Interceptors (Post-Controller)
         (TransformInterceptor: Uniform envelope { success: true, statusCode, data, timestamp })
               │
               ▼
      7. 🚨 Exception Filters 
         (AllExceptionsFilter: Catches HttpException, Prisma P2002/P2025 errors, returns clean JSON)
               │
               ▼
[ Response sent back to Storefront ]
```

---

## 3. Detailed Data Flow (Admin Dashboard ⟷ Frontend Storefront)

| Module | Admin Action (`/admin/*`) | Data Saved | Where Displayed on Frontend |
|---|---|---|---|
| **Categories** | `/admin/categories` | `name`, `slug`, `image`, `itemCount` | 1. Homepage Collections (`CategoryGrid.astro`)<br>2. Catalog Filter Bar (`ShopCatalog.tsx`) |
| **Products** | `/admin/products` | `title`, `slug`, `categoryId`, `price`, `originalPrice`, `badge`, `showInHeroBanner`, `images`, `sizes`, `stock`, `description` | 1. Homepage Featured Grid (`FeaturedProductGrid.tsx`)<br>2. Catalog Grid (`ShopCatalog.tsx`)<br>3. Details Page (`/products/[id]`)<br>4. Cart (`CartView.tsx`) |
| **Hero Slides** | `/admin/hero-slides` | Toggle `showInHeroBanner`, `heroSubtitle` | Homepage Hero Carousel (`HeroSlider.tsx` on `/`) |
| **Announcements** | `/admin/announcements` | `icon`, `text`, `link`, `isActive`, `order` | Top Header Marquee Ticker on **all pages** (`BaseLayout.astro`) |
| **Orders** | `/admin/orders` | Update status: `Pending` → `Processing` → `Shipped` → `Delivered` | 1. Public Order Tracker (`OrderTracker.tsx` on `/track-order`)<br>2. Admin Dashboard Stats |
| **Size Guide** | `/admin/size-guide` | `title`, `category`, `fitType`, `fabricTag`, `columns`, `rows` | 1. Public Size Guide (`/size-guide`)<br>2. Size Guide modal on Product Details |
| **Support** | `/admin/support` | Read tickets, reply with `adminReply` | Customer submits via Contact Form (`/contact`) |

---

## 4. Master Implementation Roadmap & Status Checklist

### Phase 1: Core Foundation & Infrastructure
- [x] **Step 1: Database Connection Layer**
  - `src/database/prisma.service.ts` (PrismaClient lifecycle: `$connect()`, `$disconnect()`)
  - `src/database/prisma.module.ts` (Global module export)
  - Registered in `src/app.module.ts`
- [x] **Step 2: Redis Caching Layer**
  - `src/redis/redis.service.ts` (`get`, `set` with TTL, `del`, `invalidatePattern` with `scanStream`)
  - `src/redis/redis.module.ts` (Global module export)
  - Registered in `src/app.module.ts`
- [x] **Step 3: Response Envelope & Global Exception Filter**
  - `src/common/interceptors/transform.interceptor.ts` (Standard `{ success: true, data }`)
  - `src/common/filters/all-exceptions.filter.ts` (Catches HTTP and Prisma errors)
  - Registered in `src/main.ts`

---

### Phase 2: Admin Authentication Module (`AuthModule`)
- [x] **Step 4: Auth DTOs & Password Utility**
  - `src/modules/auth/dto/login.dto.ts` (`email`, `password` validation)
  - `src/modules/auth/utils/password.util.ts` (`scryptSync` & `timingSafeEqual`)
- [x] **Step 5: JWT Strategy & Guard**
  - `src/modules/auth/strategies/jwt.strategy.ts` (Bearer token extraction & verification against DB)
  - `src/modules/auth/guards/jwt-auth.guard.ts` (Route guard)
  - `src/common/decorators/current-user.decorator.ts` (`@CurrentUser()`)
- [x] **Step 6: Auth Service & Controller**
  - `src/modules/auth/auth.service.ts` (`login()`, `getProfile()`)
  - `src/modules/auth/auth.controller.ts` (`POST /api/v1/auth/login`, `GET /api/v1/auth/me`)
  - `src/modules/auth/auth.module.ts` (Registers `PassportModule`, `JwtModule`)
  - `wintercart.postman_collection.json` (Postman collection with auto token capture)


---

### Phase 3: Categories Module (`CategoriesModule`)
- [x] **Step 7: Category DTOs & Service**
  - DTOs: `CreateCategoryDto`, `UpdateCategoryDto`
  - Service: `CategoriesService` (Redis read-through caching & automatic cache invalidation)
- [x] **Step 8: Category Controller & Module**
  - Public routes: `GET /api/v1/categories`, `GET /api/v1/categories/:slug`
  - Admin routes (`@UseGuards(JwtAuthGuard)`): `POST`, `PATCH`, `DELETE`
  - Updated `wintercart.postman_collection.json` with Categories endpoints

---

### Phase 3.5: Media & Image Uploads Module (`UploadsModule`)
- [x] **Dedicated Upload Service & Controller**
  - `src/modules/uploads/uploads.service.ts` (Absolute URL generation, file validation, deletion)
  - `src/modules/uploads/uploads.controller.ts` (`POST /api/v1/uploads/image`, `POST /api/v1/uploads/images`)
  - `src/modules/uploads/uploads.module.ts`
  - Static file hosting at `http://localhost:3000/uploads/...`
  - Updated `wintercart.postman_collection.json` with Uploads endpoints



---

### Phase 4: Products Catalog Module (`ProductsModule`)
- [x] **Step 9: Product Query DTOs & Service**
  - DTOs: `CreateProductDto`, `UpdateProductDto`, `QueryProductDto`
  - Service: `ProductsService` (Search, filter, pagination, sorting, hero banners, featured products, L1/L2 Redis caching, cache eviction)
- [x] **Step 10: Product Controller & Endpoints**
  - Public: `GET /api/v1/products`, `GET /api/v1/products/:idOrSlug`, `GET /api/v1/products/hero-banner`, `GET /api/v1/products/featured`
  - Admin: `POST /api/v1/products`, `PATCH /api/v1/products/:id`, `DELETE /api/v1/products/:id`
  - Updated `wintercart.postman_collection.json` with all Products endpoints


---

### Phase 5: Hero Slides & Announcements Modules
- [x] **Step 11: Announcements Module**
  - DTOs: `CreateAnnouncementDto`, `UpdateAnnouncementDto`
  - Service: `AnnouncementsService` (L1/L2 multi-tier caching, sub-millisecond retrieval, asynchronous cache eviction)
  - Controller: `AnnouncementsController`
    - Public: `GET /api/v1/announcements` (Cached)
    - Admin: `GET /api/v1/announcements/admin`, `GET /api/v1/announcements/:id`, `POST /api/v1/announcements`, `PATCH /api/v1/announcements/:id`, `DELETE /api/v1/announcements/:id`
- [x] **Step 12: Hero Slides Module**
  - DTOs: `CreateHeroSlideDto`, `UpdateHeroSlideDto`
  - Service: `HeroSlidesService` (Homepage carousel slide management, product relation linking, Decimal normalization, multi-tier caching)
  - Controller: `HeroSlidesController`
    - Public: `GET /api/v1/hero-slides` (Cached)
    - Admin: `GET /api/v1/hero-slides/admin`, `GET /api/v1/hero-slides/:id`, `POST /api/v1/hero-slides`, `PATCH /api/v1/hero-slides/:id`, `DELETE /api/v1/hero-slides/:id`
  - Updated `wintercart.postman_collection.json` with all Announcements and Hero Slides endpoints

---

### Phase 6: Orders & Checkout Module (`OrdersModule`)
- [ ] **Step 13: Order Creation (Atomic Transaction)**
  - Public Guest Checkout: `POST /api/v1/orders`
  - Validates `customerName`, `phone`, `address`, `city`, `items: [{ productId, size, quantity }]`.
  - **Prisma `$transaction`**:
    1. Fetch current product prices from database (never trust client prices).
    2. Decrement product stock.
    3. Calculate delivery fee (Free if subtotal $\ge 2,500$ ৳, else 70 ৳).
    4. Generate human-readable `orderNumber` (e.g. `WC-98412`).
    5. Save `Order` and `OrderItem` records.
- [ ] **Step 14: Order Tracking & Admin Fulfillment**
  - Public: `GET /api/v1/orders/track?orderNumber=...&phone=...`
  - Admin: `GET /api/v1/orders` (filter by status, paginated), `PATCH /api/v1/orders/:id/status`

---

### Phase 7: Customer Support & Size Guide Modules
- [ ] **Step 15: Support Tickets**
  - Public: `POST /api/v1/support` (Guest contact form submission)
  - Admin: `GET /api/v1/admin/support`, `POST /api/v1/admin/support/:id/reply`
- [ ] **Step 16: Size Guide Service**
  - Public: `GET /api/v1/size-guide`
  - Admin: Update size guide tables and measurements.

---

### Phase 8: Admin Dashboard Analytics
- [ ] **Step 17: Dashboard Overview Metrics**
  - `GET /api/v1/admin/dashboard/stats`: Total revenue, orders count, pending dispatch, active products count, recent orders list.

---

## 5. Development Commands Reference

```bash
# Start backend in watch mode
cd backend
yarn start:dev

# Build check
cd backend
yarn build

# Prisma schema sync to database
cd backend
yarn prisma db push

# Prisma Studio (Web GUI for database)
cd backend
yarn prisma studio
```

