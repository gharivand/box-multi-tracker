import { formatPrice } from "../../../domain/catalog";
import { useProductDetails } from "./product-details.hook";
import type { ProductDetailsProps } from "./product-details.types";

export function ProductDetails({ productId }: ProductDetailsProps) {
  const { product, quantity, added, increase, decrease, addToCart, goBack } = useProductDetails(productId);

  return (
    <section>
      <button type="button" className="link-button" onClick={goBack}>
        ← All products
      </button>

      {product === undefined ? (
        <p className="muted">This product does not exist.</p>
      ) : (
        <div className="detail">
          <div className="detail-image" style={{ background: product.color }} aria-hidden="true">
            {product.emoji}
          </div>
          <div className="detail-info">
            <h1>{product.name}</h1>
            <p className="detail-price">{formatPrice(product.price)}</p>
            <p>{product.description}</p>

            <div className="row">
              <div className="stepper" aria-label="Quantity">
                <button type="button" onClick={decrease} aria-label="Decrease quantity">
                  −
                </button>
                <span>{quantity}</span>
                <button type="button" onClick={increase} aria-label="Increase quantity">
                  +
                </button>
              </div>
              <button type="button" className="button button-primary" onClick={addToCart}>
                Add to cart
              </button>
            </div>
            {added && <p className="notice">Added to your cart.</p>}
          </div>
        </div>
      )}
    </section>
  );
}
