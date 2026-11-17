import { useMemo, useState } from "react";
import { useTracking } from "../../../app/providers/playground.context";
import type { CheckoutStatus, CheckoutTracking, PlacedOrder } from "./complete-order.types";
import { createDemoCart, placeOrder, summarizeCart } from "./order.service";

export function useCompleteOrder() {
  const tracking: CheckoutTracking = useTracking();
  const summary = useMemo(() => summarizeCart(createDemoCart()), []);
  const [declinePayment, setDeclinePayment] = useState(false);
  const [status, setStatus] = useState<CheckoutStatus>("idle");
  const [order, setOrder] = useState<PlacedOrder | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function submitOrder(): Promise<void> {
    setStatus("placing");
    setError(null);

    let placed: PlacedOrder;
    try {
      placed = await placeOrder(summary, { declinePayment });
    } catch (failure) {
      // A declined payment is not a completed order: nothing is tracked.
      setError(failure instanceof Error ? failure.message : "Order failed.");
      setStatus("failed");
      return;
    }

    setOrder(placed);
    setStatus("completed");
    // Tracked only after the order was actually created.
    tracking.orderCompleted({
      orderId: placed.orderId,
      totalPrice: placed.totalPrice,
      itemsCount: placed.itemsCount,
    });
  }

  return { summary, declinePayment, setDeclinePayment, status, order, error, submitOrder };
}
