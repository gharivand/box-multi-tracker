import { formatPrice } from "../../../domain/catalog";
import { useCartView } from "./cart-view.hook";

export function CartView() {
  const { lines, total, itemCount, changeQuantity, remove, continueShopping, checkout } = useCartView();

  if (lines.length === 0) {
    return (
      <section>
        <h1>Your cart</h1>
        <p className="muted">Your cart is empty.</p>
        <button type="button" className="button" onClick={continueShopping}>
          Browse products
        </button>
      </section>
    );
  }

  return (
    <section>
      <h1>Your cart</h1>
      <ul className="cart-lines">
        {lines.map(({ product, quantity, subtotal }) => (
          <li key={product.id} className="cart-line">
            <span className="cart-thumb" style={{ background: product.color }} aria-hidden="true">
              {product.emoji}
            </span>
            <span className="cart-name">
              {product.name}
              <small className="muted">{formatPrice(product.price)} each</small>
            </span>
            <span className="stepper" aria-label={`Quantity of ${product.name}`}>
              <button
                type="button"
                onClick={() => changeQuantity(product.id, -1)}
                aria-label={`Decrease quantity of ${product.name}`}
              >
                −
              </button>
              <span>{quantity}</span>
              <button
                type="button"
                onClick={() => changeQuantity(product.id, 1)}
                aria-label={`Increase quantity of ${product.name}`}
              >
                +
              </button>
            </span>
            <span className="cart-subtotal">{formatPrice(subtotal)}</span>
            <button type="button" className="link-button" onClick={() => remove(product.id)}>
              Remove
            </button>
          </li>
        ))}
      </ul>

      <div className="cart-footer">
        <p className="cart-total">
          Total ({itemCount} items) <strong>{formatPrice(total)}</strong>
        </p>
        <button type="button" className="button button-primary" onClick={checkout}>
          Checkout
        </button>
      </div>
    </section>
  );
}
