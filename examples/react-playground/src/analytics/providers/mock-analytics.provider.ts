import type { AnalyticsEvent, AnalyticsProvider } from "box-multi-tracker";
import type { AppEvents } from "../events";

/** What the (simulated) vendor receives. */
export interface VendorEvent {
  type: string;
  properties: Record<string, string | number>;
}

export interface MockAnalyticsOptions {
  /** Simulated network latency. */
  latencyMs?: number;
  /** Receives what would be sent to the vendor. Defaults to a no-op. */
  onSend?: (event: VendorEvent) => void;
}

/**
 * Asynchronous provider that translates application events into a vendor's
 * vocabulary. No real vendor SDK is involved; the "network call" is a timer.
 *
 * Every event of the application is handled in an exhaustive `switch`, so
 * adding an event to `AppEvents` makes this file fail to compile until the
 * mapping is decided.
 */
export function createMockAnalyticsProvider(options: MockAnalyticsOptions = {}): AnalyticsProvider<AppEvents> {
  const { latencyMs = 250, onSend = () => {} } = options;

  return {
    name: "mock-analytics",
    async track(event) {
      const vendorEvent = toVendorEvent(event);
      await new Promise<void>((resolve) => setTimeout(resolve, latencyMs));
      onSend(vendorEvent);
    },
  };
}

function toVendorEvent(event: AnalyticsEvent<AppEvents>): VendorEvent {
  // `event.name` narrows `event.payload` in every branch.
  switch (event.name) {
    case "user_signed_in":
      return { type: "login", properties: { user: event.payload.userId, method: event.payload.method } };
    case "product_viewed":
      return {
        type: "view_item",
        properties: { item: event.payload.productId, name: event.payload.productName, price: event.payload.price },
      };
    case "order_completed":
      return {
        type: "purchase",
        properties: { order: event.payload.orderId, value: event.payload.totalPrice, items: event.payload.itemsCount },
      };
    case "user_signed_out":
      return { type: "logout", properties: {} };
    default: {
      const unhandled: never = event;
      throw new Error(`Unhandled event: ${JSON.stringify(unhandled)}`);
    }
  }
}
