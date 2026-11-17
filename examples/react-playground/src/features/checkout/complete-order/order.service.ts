import { PRODUCTS } from "../../../domain/catalog";
import type { CartLine, CartSummary, PlacedOrder } from "./complete-order.types";

const LATENCY_MS = 600;

/** The demo cart: two boxes and one tape pack. */
export function createDemoCart(): readonly CartLine[] {
  const quantities: Record<string, number> = { "box-m": 2, "tape-6": 1 };
  return PRODUCTS.flatMap((product) => {
    const quantity = quantities[product.id] ?? 0;
    return quantity > 0 ? [{ product, quantity }] : [];
  });
}

export function summarizeCart(lines: readonly CartLine[]): CartSummary {
  const itemsCount = lines.reduce((sum, line) => sum + line.quantity, 0);
  const cents = lines.reduce((sum, line) => sum + Math.round(line.product.price * 100) * line.quantity, 0);
  return { lines, itemsCount, totalPrice: cents / 100 };
}

/** Simulates payment and order creation. Rejects when the payment is declined. */
export async function placeOrder(summary: CartSummary, options: { declinePayment: boolean }): Promise<PlacedOrder> {
  await new Promise<void>((resolve) => setTimeout(resolve, LATENCY_MS));
  if (options.declinePayment) {
    throw new Error("Payment declined.");
  }
  return {
    orderId: `order-${Date.now().toString(36)}`,
    totalPrice: summary.totalPrice,
    itemsCount: summary.itemsCount,
  };
}
