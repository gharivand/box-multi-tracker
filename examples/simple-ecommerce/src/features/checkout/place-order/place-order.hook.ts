import { trackOrderCompleted } from "../../../analytics/tracking";
import { useShop } from "../../../app/providers/shop.context";
import { cartItemCount, cartTotal, detailLines } from "../../../domain/cart";
import { createOrderId } from "../../../domain/order";

export function usePlaceOrder() {
  const { cart, dispatch, navigate } = useShop();
  const lines = detailLines(cart);
  const total = cartTotal(lines);
  const itemCount = cartItemCount(lines);

  function placeOrder(): void {
    const orderId = createOrderId();
    trackOrderCompleted(orderId, total, itemCount);
    dispatch({ type: "clear" });
    navigate({ page: "confirmation", orderId, total });
  }

  return {
    lines,
    total,
    itemCount,
    placeOrder,
    backToCart: () => navigate({ page: "cart" }),
    backToProducts: () => navigate({ page: "products" }),
  };
}
