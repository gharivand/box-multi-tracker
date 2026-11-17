import { useCompleteOrder } from "./complete-order.hook";

export function CompleteOrder() {
  const { summary, declinePayment, setDeclinePayment, status, order, error, submitOrder } = useCompleteOrder();

  return (
    <section className="card">
      <h2>Complete order</h2>
      <p className="hint">
        Tracks <code>order_completed</code> only after the order has been created.
      </p>

      <ul className="cart">
        {summary.lines.map((line) => (
          <li key={line.product.id}>
            <span>
              {line.quantity} × {line.product.name}
            </span>
            <span>${(line.product.price * line.quantity).toFixed(2)}</span>
          </li>
        ))}
        <li className="total">
          <span>Total ({summary.itemsCount} items)</span>
          <span>${summary.totalPrice.toFixed(2)}</span>
        </li>
      </ul>

      <label className="check">
        <input type="checkbox" checked={declinePayment} onChange={(event) => setDeclinePayment(event.target.checked)} />
        Simulate a declined payment
      </label>

      <button type="button" disabled={status === "placing"} onClick={() => void submitOrder()}>
        {status === "placing" ? "Placing order…" : "Place order"}
      </button>

      {status === "completed" && order !== null && (
        <p className="ok-text">
          Order <code>{order.orderId}</code> placed.
        </p>
      )}
      {error !== null && <p className="error-text">{error}</p>}
    </section>
  );
}
