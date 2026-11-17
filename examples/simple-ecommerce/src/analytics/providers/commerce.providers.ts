import type { AnalyticsEvent, AnalyticsProvider } from "box-multi-tracker";
import { formatPayload } from "../event-log";
import type { EventLog } from "../event-log";
import type { CommerceEvents } from "../events/commerce.events";

export const BACKEND_PROVIDER = "backendProvider";
export const COMMERCE_LOG_PROVIDER = "commerceLogProvider";

/** Provider names of the Commerce Analytics instance, in registration order. */
export const commerceProviderNames = [BACKEND_PROVIDER, COMMERCE_LOG_PROVIDER] as const;

/** Lets the demo make the simulated backend fail, to show that failures stay isolated. */
export interface FaultSwitch {
  failing: boolean;
}

const BACKEND_LATENCY_MS = 300;

/**
 * Simulates sending commerce events to a backend. It is asynchronous: the
 * returned promise settles after a simulated network delay, and the SDK does
 * not wait for it. When the fault switch is on, the promise rejects and the
 * SDK reports it to `onError` without affecting other providers.
 */
export function createBackendProvider(log: EventLog, fault: FaultSwitch): AnalyticsProvider<CommerceEvents> {
  return {
    name: BACKEND_PROVIDER,
    async track(event) {
      await new Promise<void>((resolve) => setTimeout(resolve, BACKEND_LATENCY_MS));
      if (fault.failing) {
        throw new Error("POST /api/events failed: 503 Service Unavailable");
      }
      log.record({
        instance: "commerce",
        provider: BACKEND_PROVIDER,
        eventName: event.name,
        payload: formatPayload(event.payload),
        status: "delivered",
        detail: "POST /api/events → 202 Accepted",
      });
    },
  };
}

/** Records commerce activity as readable lines. Independent of `backendProvider`. */
export function createCommerceLogProvider(log: EventLog): AnalyticsProvider<CommerceEvents> {
  return {
    name: COMMERCE_LOG_PROVIDER,
    track(event) {
      log.record({
        instance: "commerce",
        provider: COMMERCE_LOG_PROVIDER,
        eventName: event.name,
        payload: formatPayload(event.payload),
        status: "delivered",
        detail: describeActivity(event),
      });
    },
  };
}

function describeActivity(event: AnalyticsEvent<CommerceEvents>): string {
  switch (event.name) {
    case "product_added_to_cart":
      return `Added ${event.payload.quantity} × ${event.payload.productId} to the cart`;
    case "checkout_started":
      return `Checkout started: ${event.payload.itemCount} items, total ${event.payload.total}`;
    case "order_completed":
      return `Order ${event.payload.orderId} completed, total ${event.payload.total}`;
    default: {
      const unhandled: never = event;
      throw new Error(`Unhandled event: ${JSON.stringify(unhandled)}`);
    }
  }
}
