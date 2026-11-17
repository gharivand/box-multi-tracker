import { findProduct } from "./catalog";
import type { Product } from "./catalog";

export interface CartLine {
  productId: string;
  quantity: number;
}

export type Cart = readonly CartLine[];

export type CartAction =
  | { type: "add"; productId: string; quantity: number }
  | { type: "setQuantity"; productId: string; quantity: number }
  | { type: "remove"; productId: string }
  | { type: "clear" };

export const MAX_QUANTITY = 10;

export const emptyCart: Cart = [];

export function cartReducer(cart: Cart, action: CartAction): Cart {
  switch (action.type) {
    case "add": {
      const existing = cart.find((line) => line.productId === action.productId);
      if (existing === undefined) {
        return [...cart, { productId: action.productId, quantity: clamp(action.quantity) }];
      }
      return cart.map((line) =>
        line.productId === action.productId ? { ...line, quantity: clamp(line.quantity + action.quantity) } : line,
      );
    }
    case "setQuantity":
      if (action.quantity < 1) return cart.filter((line) => line.productId !== action.productId);
      return cart.map((line) =>
        line.productId === action.productId ? { ...line, quantity: clamp(action.quantity) } : line,
      );
    case "remove":
      return cart.filter((line) => line.productId !== action.productId);
    case "clear":
      return emptyCart;
  }
}

function clamp(quantity: number): number {
  return Math.min(MAX_QUANTITY, Math.max(1, quantity));
}

export interface DetailedLine {
  product: Product;
  quantity: number;
  subtotal: number;
}

/** Cart lines joined with their products. Lines whose product no longer exists are dropped. */
export function detailLines(cart: Cart): readonly DetailedLine[] {
  const lines: DetailedLine[] = [];
  for (const { productId, quantity } of cart) {
    const product = findProduct(productId);
    if (product !== undefined) {
      lines.push({ product, quantity, subtotal: product.price * quantity });
    }
  }
  return lines;
}

export function cartTotal(lines: readonly DetailedLine[]): number {
  return lines.reduce((sum, line) => sum + line.subtotal, 0);
}

export function cartItemCount(lines: readonly DetailedLine[]): number {
  return lines.reduce((sum, line) => sum + line.quantity, 0);
}
