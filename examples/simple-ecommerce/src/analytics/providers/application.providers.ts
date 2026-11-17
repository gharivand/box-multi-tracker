import type { AnalyticsEvent, AnalyticsProvider } from "box-multi-tracker";
import { formatPayload } from "../event-log";
import type { EventLog } from "../event-log";
import type { ApplicationEvents } from "../events/application.events";

export const ANALYTICS_PROVIDER = "analyticsProvider";
export const ACTIVITY_LOG_PROVIDER = "activityLogProvider";

/** Provider names of the Application Analytics instance, in registration order. */
export const applicationProviderNames = [ANALYTICS_PROVIDER, ACTIVITY_LOG_PROVIDER] as const;

/** What the simulated external analytics destination receives. */
interface VendorEvent {
  type: string;
  properties: Record<string, string | number>;
}

/**
 * Simulates sending general application events to an external analytics tool.
 * It translates application events into the tool's vocabulary; no real vendor
 * SDK is involved. It knows nothing about the other provider.
 */
export function createAnalyticsProvider(log: EventLog): AnalyticsProvider<ApplicationEvents> {
  return {
    name: ANALYTICS_PROVIDER,
    track(event) {
      const vendorEvent = toVendorEvent(event);
      log.record({
        instance: "application",
        provider: ANALYTICS_PROVIDER,
        eventName: event.name,
        payload: formatPayload(vendorEvent.properties),
        status: "delivered",
        detail: `sent to the analytics tool as "${vendorEvent.type}"`,
      });
    },
  };
}

function toVendorEvent(event: AnalyticsEvent<ApplicationEvents>): VendorEvent {
  // `event.name` narrows `event.payload` in every branch, and the `never`
  // check makes a new event in `ApplicationEvents` a compile error here.
  switch (event.name) {
    case "user_signed_in":
      return { type: "login", properties: { user: event.payload.userId } };
    case "user_signed_out":
      return { type: "logout", properties: {} };
    case "product_viewed":
      return {
        type: "view_item",
        properties: { item: event.payload.productId, name: event.payload.productName, price: event.payload.price },
      };
    case "search_performed":
      return { type: "search", properties: { term: event.payload.query, results: event.payload.resultCount } };
    default: {
      const unhandled: never = event;
      throw new Error(`Unhandled event: ${JSON.stringify(unhandled)}`);
    }
  }
}

/** Records general application activity as readable lines. Independent of `analyticsProvider`. */
export function createActivityLogProvider(log: EventLog): AnalyticsProvider<ApplicationEvents> {
  return {
    name: ACTIVITY_LOG_PROVIDER,
    track(event) {
      log.record({
        instance: "application",
        provider: ACTIVITY_LOG_PROVIDER,
        eventName: event.name,
        payload: formatPayload(event.payload),
        status: "delivered",
        detail: describeActivity(event),
      });
    },
  };
}

function describeActivity(event: AnalyticsEvent<ApplicationEvents>): string {
  switch (event.name) {
    case "user_signed_in":
      return `User ${event.payload.userId} signed in`;
    case "user_signed_out":
      return "User signed out";
    case "product_viewed":
      return `Viewed "${event.payload.productName}"`;
    case "search_performed":
      return `Searched for "${event.payload.query}" (${event.payload.resultCount} results)`;
    default: {
      const unhandled: never = event;
      throw new Error(`Unhandled event: ${JSON.stringify(unhandled)}`);
    }
  }
}
