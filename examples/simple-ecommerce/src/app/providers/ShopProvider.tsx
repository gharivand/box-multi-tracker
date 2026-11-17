import type { ReactNode } from "react";
import { ShopContext } from "./shop.context";
import { useShopState } from "./shop.hook";

export function ShopProvider({ children }: { children: ReactNode }) {
  const value = useShopState();
  return <ShopContext.Provider value={value}>{children}</ShopContext.Provider>;
}
