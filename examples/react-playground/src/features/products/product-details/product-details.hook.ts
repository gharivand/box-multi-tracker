import { useRef, useState } from "react";
import { useTracking } from "../../../app/providers/playground.context";
import { PRODUCTS, fetchProduct } from "../../../domain/catalog";
import type { Product } from "../../../domain/catalog";
import type { ProductLoadStatus, ProductTracking } from "./product-details.types";

export function useProductDetails() {
  const tracking: ProductTracking = useTracking();
  const [product, setProduct] = useState<Product | null>(null);
  const [status, setStatus] = useState<ProductLoadStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  /** Ignores responses that arrive after a newer request was started. */
  const latestRequest = useRef(0);

  async function viewProduct(productId: string): Promise<void> {
    const request = ++latestRequest.current;
    setStatus("loading");
    setError(null);

    let loaded: Product;
    try {
      loaded = await fetchProduct(productId);
    } catch (failure) {
      if (request === latestRequest.current) {
        setError(failure instanceof Error ? failure.message : "Could not load the product.");
        setStatus("error");
      }
      return;
    }
    if (request !== latestRequest.current) return;

    setProduct(loaded);
    setStatus("loaded");
    // Tracked once the details are actually shown to the user.
    tracking.productViewed({ productId: loaded.id, productName: loaded.name, price: loaded.price });
  }

  return { products: PRODUCTS, product, status, error, viewProduct };
}
