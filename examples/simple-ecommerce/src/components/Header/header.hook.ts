import { useShop } from "../../app/providers/shop.context";
import { cartItemCount, detailLines } from "../../domain/cart";

export function useHeader() {
  const { cart, navigate } = useShop();

  return {
    cartCount: cartItemCount(detailLines(cart)),
    goToProducts: () => navigate({ page: "products" }),
    goToCart: () => navigate({ page: "cart" }),
  };
}
