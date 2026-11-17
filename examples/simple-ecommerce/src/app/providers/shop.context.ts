import { createContext, useContext } from "react";
import type { ShopContextValue } from "./shop.types";

export const ShopContext = createContext<ShopContextValue | null>(null);

export function useShop(): ShopContextValue {
  const value = useContext(ShopContext);
  if (value === null) {
    throw new Error("useShop must be used inside <ShopProvider>");
  }
  return value;
}
