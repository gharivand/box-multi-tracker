import { formatPrice } from "../../../domain/catalog";
import { useOrderConfirmation } from "./order-confirmation.hook";
import type { OrderConfirmationProps } from "./order-confirmation.types";

export function OrderConfirmation({ orderId, total }: OrderConfirmationProps) {
  const { continueShopping } = useOrderConfirmation();

  return (
    <section className="confirmation">
      <h1>Thank you for your order!</h1>
      <p>
        Order <strong>{orderId}</strong> for <strong>{formatPrice(total)}</strong> is confirmed.
      </p>
      <button type="button" className="button button-primary" onClick={continueShopping}>
        Continue shopping
      </button>
    </section>
  );
}
