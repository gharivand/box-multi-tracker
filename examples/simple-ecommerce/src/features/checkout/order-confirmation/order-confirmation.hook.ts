import { useShop } from "../../../app/providers/shop.context";

export function useOrderConfirmation() {
  const { navigate } = useShop();

  return { continueShopping: () => navigate({ page: "products" }) };
}
