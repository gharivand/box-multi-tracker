import type { Dispatch } from "react";
import type { Cart, CartAction } from "../../domain/cart";

/** The whole "router": one value says which page is shown. */
export type Route =
  | { page: "products" }
  | { page: "product"; productId: string }
  | { page: "cart" }
  | { page: "checkout" }
  | { page: "confirmation"; orderId: string; total: number };

export interface ShopContextValue {
  route: Route;
  navigate(route: Route): void;
  cart: Cart;
  dispatch: Dispatch<CartAction>;
}
