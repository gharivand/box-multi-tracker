import { formatPrice } from "../../../domain/catalog";
import { usePlaceOrder } from "./place-order.hook";

export function PlaceOrder() {
  const { lines, total, itemCount, placeOrder, backToCart, backToProducts } = usePlaceOrder();

  if (lines.length === 0) {
    return (
      <section>
        <h1>Checkout</h1>
        <p className="muted">There is nothing to check out.</p>
        <button type="button" className="button" onClick={backToProducts}>
          Back to products
        </button>
      </section>
    );
  }

  return (
    <section>
      <h1>Checkout</h1>
      <ul className="summary">
        {lines.map(({ product, quantity, subtotal }) => (
          <li key={product.id}>
            <span>
              {quantity} × {product.name}
            </span>
            <span>{formatPrice(subtotal)}</span>
          </li>
        ))}
        <li className="summary-total">
          <span>Total ({itemCount} items)</span>
          <strong>{formatPrice(total)}</strong>
        </li>
      </ul>
      <p className="muted">This is a demo: no payment is taken and nothing is sent anywhere.</p>
      <div className="row">
        <button type="button" className="button button-primary" onClick={placeOrder}>
          Place order
        </button>
        <button type="button" className="button button-ghost" onClick={backToCart}>
          Back to cart
        </button>
      </div>
    </section>
  );
}
