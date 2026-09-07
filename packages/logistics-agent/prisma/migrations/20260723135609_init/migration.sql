-- CreateEnum
CREATE TYPE "OrderStatus" AS ENUM ('DRAFT', 'CONFIRMED', 'PROCESSING', 'PARTIALLY_SHIPPED', 'SHIPPED', 'DELIVERED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "DeliveryStatus" AS ENUM ('PLANNED', 'PREPARING', 'READY', 'IN_TRANSIT', 'DELIVERED', 'FAILED', 'RETURNED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "AddressStatus" AS ENUM ('DRAFT', 'ACTIVE', 'LOCKED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "AddressUsage" AS ENUM ('CUSTOMER', 'SUPPLIER', 'BILLING', 'SHIPPING', 'DELIVERY');

-- CreateEnum
CREATE TYPE "StockMovementType" AS ENUM ('RECEIPT', 'RESERVATION', 'RELEASE', 'SHIPMENT', 'ADJUSTMENT', 'RETURN');

-- CreateTable
CREATE TABLE "Customer" (
    "id" UUID NOT NULL,
    "customerNumber" TEXT NOT NULL,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "phone" TEXT,
    "currentAddressId" UUID,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Customer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Address" (
    "id" UUID NOT NULL,
    "status" "AddressStatus" NOT NULL DEFAULT 'ACTIVE',
    "usage" "AddressUsage" NOT NULL,
    "label" TEXT,
    "line1" TEXT NOT NULL,
    "line2" TEXT,
    "postalCode" TEXT NOT NULL,
    "city" TEXT NOT NULL,
    "stateOrProvince" TEXT,
    "countryCode" VARCHAR(2) NOT NULL,
    "lockedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Address_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Order" (
    "id" UUID NOT NULL,
    "orderNumber" TEXT NOT NULL,
    "customerId" UUID NOT NULL,
    "billingAddressId" UUID NOT NULL,
    "shippingAddressId" UUID NOT NULL,
    "status" "OrderStatus" NOT NULL DEFAULT 'DRAFT',
    "orderedAt" TIMESTAMP(3),
    "requestedDeliveryDate" TIMESTAMP(3),
    "currencyCode" VARCHAR(3) NOT NULL DEFAULT 'EUR',
    "subtotalAmount" DECIMAL(12,2) NOT NULL,
    "discountAmount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "shippingAmount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "taxAmount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "totalExcludingTax" DECIMAL(12,2) NOT NULL,
    "totalIncludingTax" DECIMAL(12,2) NOT NULL,
    "paidAmount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "refundedAmount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "amountDue" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Order_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrderLinePrice" (
    "id" UUID NOT NULL,
    "currencyCode" VARCHAR(3) NOT NULL DEFAULT 'EUR',
    "unitPriceExcludingTax" DECIMAL(12,2) NOT NULL,
    "discountAmount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "taxRate" DECIMAL(5,2) NOT NULL,
    "taxAmount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "lineTotalExcludingTax" DECIMAL(12,2) NOT NULL,
    "lineTotalIncludingTax" DECIMAL(12,2) NOT NULL,
    "frozenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OrderLinePrice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrderLine" (
    "id" UUID NOT NULL,
    "orderId" UUID NOT NULL,
    "priceId" UUID NOT NULL,
    "productId" UUID NOT NULL,
    "lineNumber" INTEGER NOT NULL,
    "skuSnapshot" TEXT NOT NULL,
    "nameSnapshot" TEXT NOT NULL,
    "orderedQuantity" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OrderLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Delivery" (
    "id" UUID NOT NULL,
    "deliveryNumber" TEXT NOT NULL,
    "orderId" UUID NOT NULL,
    "addressId" UUID NOT NULL,
    "status" "DeliveryStatus" NOT NULL DEFAULT 'PLANNED',
    "carrierName" TEXT,
    "trackingNumber" TEXT,
    "trackingUrl" TEXT,
    "plannedShipmentAt" TIMESTAMP(3),
    "shippedAt" TIMESTAMP(3),
    "estimatedDeliveryAt" TIMESTAMP(3),
    "deliveredAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Delivery_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DeliveryLine" (
    "id" UUID NOT NULL,
    "deliveryId" UUID NOT NULL,
    "orderLineId" UUID NOT NULL,
    "shippedQuantity" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DeliveryLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Supplier" (
    "id" UUID NOT NULL,
    "supplierCode" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "contactEmail" TEXT,
    "phone" TEXT,
    "currentAddressId" UUID,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Supplier_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SupplierProduct" (
    "id" UUID NOT NULL,
    "supplierId" UUID NOT NULL,
    "productId" UUID NOT NULL,
    "supplierSku" TEXT,
    "purchasePrice" DECIMAL(12,2) NOT NULL,
    "currencyCode" VARCHAR(3) NOT NULL DEFAULT 'EUR',
    "leadTimeDays" INTEGER,
    "minimumOrderQuantity" INTEGER NOT NULL DEFAULT 1,
    "isPreferred" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SupplierProduct_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Product" (
    "id" UUID NOT NULL,
    "sku" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Product_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StockItem" (
    "id" UUID NOT NULL,
    "productId" UUID NOT NULL,
    "locationCode" TEXT NOT NULL,
    "onHandQuantity" INTEGER NOT NULL DEFAULT 0,
    "reservedQuantity" INTEGER NOT NULL DEFAULT 0,
    "availableQuantity" INTEGER NOT NULL DEFAULT 0,
    "safetyStockQuantity" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StockItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StockMovement" (
    "id" UUID NOT NULL,
    "productId" UUID NOT NULL,
    "locationCode" TEXT NOT NULL,
    "movementType" "StockMovementType" NOT NULL,
    "quantityDelta" INTEGER NOT NULL,
    "referenceType" TEXT,
    "referenceId" TEXT,
    "reason" TEXT,
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StockMovement_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Customer_customerNumber_key" ON "Customer"("customerNumber");

-- CreateIndex
CREATE UNIQUE INDEX "Customer_email_key" ON "Customer"("email");

-- CreateIndex
CREATE INDEX "Customer_lastName_firstName_idx" ON "Customer"("lastName", "firstName");

-- CreateIndex
CREATE INDEX "Address_status_usage_idx" ON "Address"("status", "usage");

-- CreateIndex
CREATE INDEX "Address_postalCode_city_idx" ON "Address"("postalCode", "city");

-- CreateIndex
CREATE UNIQUE INDEX "Order_orderNumber_key" ON "Order"("orderNumber");

-- CreateIndex
CREATE INDEX "Order_customerId_createdAt_idx" ON "Order"("customerId", "createdAt");

-- CreateIndex
CREATE INDEX "Order_status_createdAt_idx" ON "Order"("status", "createdAt");

-- CreateIndex
CREATE INDEX "Order_requestedDeliveryDate_idx" ON "Order"("requestedDeliveryDate");

-- CreateIndex
CREATE UNIQUE INDEX "OrderLine_priceId_key" ON "OrderLine"("priceId");

-- CreateIndex
CREATE INDEX "OrderLine_productId_idx" ON "OrderLine"("productId");

-- CreateIndex
CREATE UNIQUE INDEX "OrderLine_orderId_lineNumber_key" ON "OrderLine"("orderId", "lineNumber");

-- CreateIndex
CREATE UNIQUE INDEX "Delivery_deliveryNumber_key" ON "Delivery"("deliveryNumber");

-- CreateIndex
CREATE INDEX "Delivery_orderId_createdAt_idx" ON "Delivery"("orderId", "createdAt");

-- CreateIndex
CREATE INDEX "Delivery_status_estimatedDeliveryAt_idx" ON "Delivery"("status", "estimatedDeliveryAt");

-- CreateIndex
CREATE INDEX "Delivery_trackingNumber_idx" ON "Delivery"("trackingNumber");

-- CreateIndex
CREATE INDEX "DeliveryLine_orderLineId_idx" ON "DeliveryLine"("orderLineId");

-- CreateIndex
CREATE UNIQUE INDEX "DeliveryLine_deliveryId_orderLineId_key" ON "DeliveryLine"("deliveryId", "orderLineId");

-- CreateIndex
CREATE UNIQUE INDEX "Supplier_supplierCode_key" ON "Supplier"("supplierCode");

-- CreateIndex
CREATE INDEX "Supplier_name_idx" ON "Supplier"("name");

-- CreateIndex
CREATE INDEX "SupplierProduct_productId_isPreferred_idx" ON "SupplierProduct"("productId", "isPreferred");

-- CreateIndex
CREATE UNIQUE INDEX "SupplierProduct_supplierId_productId_key" ON "SupplierProduct"("supplierId", "productId");

-- CreateIndex
CREATE UNIQUE INDEX "Product_sku_key" ON "Product"("sku");

-- CreateIndex
CREATE INDEX "Product_name_idx" ON "Product"("name");

-- CreateIndex
CREATE INDEX "StockItem_locationCode_idx" ON "StockItem"("locationCode");

-- CreateIndex
CREATE INDEX "StockItem_availableQuantity_idx" ON "StockItem"("availableQuantity");

-- CreateIndex
CREATE UNIQUE INDEX "StockItem_productId_locationCode_key" ON "StockItem"("productId", "locationCode");

-- CreateIndex
CREATE INDEX "StockMovement_productId_occurredAt_idx" ON "StockMovement"("productId", "occurredAt");

-- CreateIndex
CREATE INDEX "StockMovement_locationCode_occurredAt_idx" ON "StockMovement"("locationCode", "occurredAt");

-- CreateIndex
CREATE INDEX "StockMovement_referenceType_referenceId_idx" ON "StockMovement"("referenceType", "referenceId");

-- AddForeignKey
ALTER TABLE "Customer" ADD CONSTRAINT "Customer_currentAddressId_fkey" FOREIGN KEY ("currentAddressId") REFERENCES "Address"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_billingAddressId_fkey" FOREIGN KEY ("billingAddressId") REFERENCES "Address"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_shippingAddressId_fkey" FOREIGN KEY ("shippingAddressId") REFERENCES "Address"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderLine" ADD CONSTRAINT "OrderLine_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderLine" ADD CONSTRAINT "OrderLine_priceId_fkey" FOREIGN KEY ("priceId") REFERENCES "OrderLinePrice"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderLine" ADD CONSTRAINT "OrderLine_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Delivery" ADD CONSTRAINT "Delivery_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Delivery" ADD CONSTRAINT "Delivery_addressId_fkey" FOREIGN KEY ("addressId") REFERENCES "Address"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeliveryLine" ADD CONSTRAINT "DeliveryLine_deliveryId_fkey" FOREIGN KEY ("deliveryId") REFERENCES "Delivery"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeliveryLine" ADD CONSTRAINT "DeliveryLine_orderLineId_fkey" FOREIGN KEY ("orderLineId") REFERENCES "OrderLine"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Supplier" ADD CONSTRAINT "Supplier_currentAddressId_fkey" FOREIGN KEY ("currentAddressId") REFERENCES "Address"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupplierProduct" ADD CONSTRAINT "SupplierProduct_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupplierProduct" ADD CONSTRAINT "SupplierProduct_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockItem" ADD CONSTRAINT "StockItem_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockMovement" ADD CONSTRAINT "StockMovement_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
