import { trackCheckoutStarted } from "../../../analytics/tracking";
import { useShop } from "../../../app/providers/shop.context";
import { cartItemCount, cartTotal, detailLines } from "../../../domain/cart";

export function useCartView() {
  const { cart, dispatch, navigate } = useShop();
  const lines = detailLines(cart);
  const total = cartTotal(lines);
  const itemCount = cartItemCount(lines);

  return {
    lines,
    total,
    itemCount,
    /** Adds `delta` (±1) to the line's quantity; a quantity below 1 removes the line. */
    changeQuantity: (productId: string, delta: number) => {
      const line = lines.find((candidate) => candidate.product.id === productId);
      if (line !== undefined) {
        dispatch({ type: "setQuantity", productId, quantity: line.quantity + delta });
      }
    },
    remove: (productId: string) => dispatch({ type: "remove", productId }),
    continueShopping: () => navigate({ page: "products" }),
    checkout: () => {
      trackCheckoutStarted(total, itemCount);
      navigate({ page: "checkout" });
    },
  };
}
