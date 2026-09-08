import type { LogisticsPrismaClient } from "../database/index.js";
import {
  notFound,
  productAvailabilityResultSchema,
  stockByLocationResultSchema,
  type ProductAvailabilityResultDto,
  type StockByLocationResultDto,
  movementHistoryResultSchema,
  stockAlertsResultSchema,
  estimatedRestockResultSchema,
  type MovementHistoryResultDto,
  type StockAlertsResultDto,
  type EstimatedRestockResultDto,

} from "../dtos/index.js";

export class InventoryQueryService {
  constructor(private readonly prisma: LogisticsPrismaClient) {}

  async getProductAvailability(
    sku: string,
  ): Promise<ProductAvailabilityResultDto> {
    const product = await this.prisma.product.findFirst({
      where: { sku, isActive: true },
      select: {
        sku: true,
        name: true,
        stockItems: {
          select: {
            onHandQuantity: true,
            reservedQuantity: true,
            availableQuantity: true,
            safetyStockQuantity: true,
          },
        },
      },
    });

    if (!product) {
      return notFound("Article actif introuvable.");
    }

    const totals = product.stockItems.reduce(
      (
        result: {
          onHandQuantity: number;
          reservedQuantity: number;
          availableQuantity: number;
          safetyStockQuantity: number;
        },
        stock: {
          onHandQuantity: number;
          reservedQuantity: number;
          availableQuantity: number;
          safetyStockQuantity: number;
        },
      ) => ({
        onHandQuantity: result.onHandQuantity + stock.onHandQuantity,
        reservedQuantity:
          result.reservedQuantity + stock.reservedQuantity,
        availableQuantity:
          result.availableQuantity + stock.availableQuantity,
        safetyStockQuantity:
          result.safetyStockQuantity + (stock.safetyStockQuantity ?? 0),
      }),
      {
        onHandQuantity: 0,
        reservedQuantity: 0,
        availableQuantity: 0,
        safetyStockQuantity: 0,
      },
    );

    return productAvailabilityResultSchema.parse({
      found: true,
      product: {
        sku: product.sku,
        name: product.name,
        isAvailable: totals.availableQuantity > 0,
        ...totals,
      },
    });
  }

  async getStockByLocation(sku: string): Promise<StockByLocationResultDto> {
    const product = await this.prisma.product.findFirst({
      where: { sku, isActive: true },
      select: {
        sku: true,
        name: true,
        stockItems: {
          select: {
            locationCode: true,
            onHandQuantity: true,
            reservedQuantity: true,
            availableQuantity: true,
            safetyStockQuantity: true,
          },
        },
      },
    });

    if (!product) return notFound("Article actif introuvable.");

    return stockByLocationResultSchema.parse({
      found: true,
      product: {
        sku: product.sku,
        name: product.name,
        locations: product.stockItems.map((item: any) => ({
          locationCode: item.locationCode,
          onHandQuantity: item.onHandQuantity,
          reservedQuantity: item.reservedQuantity,
          availableQuantity: item.availableQuantity,
          safetyStockQuantity: item.safetyStockQuantity,
        })),
      },
    });
  }


  async getMovementHistory(sku: string, limitDays = 30): Promise<MovementHistoryResultDto> {
    const product = await this.prisma.product.findFirst({
      where: { sku, isActive: true },
      select: { id: true, sku: true, name: true }
    });
    if (!product) return { found: false, error: "Article actif introuvable." } as any;

    const dateLimit = new Date(Date.now() - limitDays * 24 * 60 * 60 * 1000);

    const movements = await this.prisma.stockMovement.findMany({
      where: {
        productId: product.id,
        occurredAt: { gte: dateLimit }
      },
      orderBy: { occurredAt: 'desc' },
      take: 50
    });

    return movementHistoryResultSchema.parse({
      found: true,
      sku: product.sku,
      name: product.name,
      movements: movements.map(m => ({
        id: m.id,
        locationCode: m.locationCode,
        type: m.movementType,
        quantity: m.quantityDelta,
        occurredAt: m.occurredAt.toISOString(),
        referenceId: m.referenceId
      }))
    });
  }

  async getStockAlerts(): Promise<StockAlertsResultDto> {
    // find stock items where availableQuantity <= 0 OR availableQuantity < safetyStockQuantity
    const items = await this.prisma.stockItem.findMany({
      include: { product: true }
    });

    const alerts = items.filter(item => 
      item.availableQuantity <= 0 || item.availableQuantity < item.safetyStockQuantity
    ).map(item => ({
      sku: item.product.sku,
      name: item.product.name,
      locationCode: item.locationCode,
      availableQuantity: item.availableQuantity,
      safetyStockQuantity: item.safetyStockQuantity
    }));

    return stockAlertsResultSchema.parse({ found: true, alerts });
  }

  async getEstimatedRestock(sku: string): Promise<EstimatedRestockResultDto> {
    const product = await this.prisma.product.findFirst({
      where: { sku, isActive: true },
      include: {
        suppliers: {
          orderBy: { isPreferred: 'desc' },
          take: 1
        }
      }
    });

    if (!product) return { found: false, error: "Article introuvable." } as any;

    const supplierProduct = product.suppliers[0];
    const leadTimeDays = supplierProduct?.leadTimeDays ?? 7;
    
    const estimatedDate = new Date();
    estimatedDate.setDate(estimatedDate.getDate() + leadTimeDays);

    return estimatedRestockResultSchema.parse({
      found: true,
      leadTimeDays,
      estimatedDate: estimatedDate.toISOString()
    });
  }

}
