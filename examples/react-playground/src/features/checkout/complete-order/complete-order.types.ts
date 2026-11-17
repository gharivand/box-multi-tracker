import type { Tracking } from "../../../analytics/tracking";
import type { Product } from "../../../domain/catalog";

/** The only part of the tracking API this feature needs. */
export type CheckoutTracking = Pick<Tracking, "orderCompleted">;

export interface CartLine {
  product: Product;
  quantity: number;
}

export interface CartSummary {
  lines: readonly CartLine[];
  itemsCount: number;
  totalPrice: number;
}

export interface PlacedOrder {
  orderId: string;
  totalPrice: number;
  itemsCount: number;
}

export type CheckoutStatus = "idle" | "placing" | "completed" | "failed";
