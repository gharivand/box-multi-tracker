import { useReducer, useState } from "react";
import { cartReducer, emptyCart } from "../../domain/cart";
import type { Route, ShopContextValue } from "./shop.types";

/** The shop's local state: the current page and the cart. */
export function useShopState(): ShopContextValue {
  const [route, navigate] = useState<Route>({ page: "products" });
  const [cart, dispatch] = useReducer(cartReducer, emptyCart);
  return { route, navigate, cart, dispatch };
}
