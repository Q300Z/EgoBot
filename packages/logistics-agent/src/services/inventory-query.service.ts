import type { LogisticsPrismaClient } from "../database/index.js";
import {
  notFound,
  productAvailabilityResultSchema,
  type ProductAvailabilityResultDto,
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
        },
        stock: {
          onHandQuantity: number;
          reservedQuantity: number;
          availableQuantity: number;
        },
      ) => ({
        onHandQuantity: result.onHandQuantity + stock.onHandQuantity,
        reservedQuantity:
          result.reservedQuantity + stock.reservedQuantity,
        availableQuantity:
          result.availableQuantity + stock.availableQuantity,
      }),
      {
        onHandQuantity: 0,
        reservedQuantity: 0,
        availableQuantity: 0,
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
}
