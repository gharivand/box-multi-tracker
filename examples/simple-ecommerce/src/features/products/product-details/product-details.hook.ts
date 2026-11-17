import { useState } from "react";
import { trackProductAddedToCart } from "../../../analytics/tracking";
import { useShop } from "../../../app/providers/shop.context";
import { MAX_QUANTITY } from "../../../domain/cart";
import { findProduct } from "../../../domain/catalog";

export function useProductDetails(productId: string) {
  const { navigate, dispatch } = useShop();
  const product = findProduct(productId);
  const [quantity, setQuantity] = useState(1);
  const [added, setAdded] = useState(false);

  function addToCart(): void {
    if (product === undefined) return;
    dispatch({ type: "add", productId: product.id, quantity });
    trackProductAddedToCart(product.id, quantity, product.price);
    setAdded(true);
  }

  return {
    product,
    quantity,
    added,
    increase: () => setQuantity((current) => Math.min(MAX_QUANTITY, current + 1)),
    decrease: () => setQuantity((current) => Math.max(1, current - 1)),
    addToCart,
    goBack: () => navigate({ page: "products" }),
  };
}
