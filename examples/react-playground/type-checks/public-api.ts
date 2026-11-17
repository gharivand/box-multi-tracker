// Compile-time checks of the SDK's public type surface, as an external consumer
// sees it. Only type-checked, never executed or bundled. It runs under both
// `NodeNext` and `Bundler` module resolution (see the sibling tsconfig files).
//
// The app itself is type-checked by the root tsconfig (Vite-style resolution);
// this file is separate because NodeNext requires `.js` import extensions that
// a Vite app does not use. It therefore declares its own event map.
//
// Every `@ts-expect-error` must match a real compiler error, otherwise the
// directive itself is reported as an error.
import { createAnalytics } from "box-multi-tracker";
import type {
  AnalyticsConfig,
  AnalyticsEvent,
  AnalyticsInstance,
  AnalyticsProvider,
  EventMap,
  ProviderEntry,
  ProviderError,
} from "box-multi-tracker";

interface Events {
  user_signed_in: { userId: string; method: "email" | "google" };
  product_viewed: { productId: string; productName: string; price: number };
  order_completed: { orderId: string; totalPrice: number; itemsCount: number };
  user_signed_out: undefined;
  search_performed: { query: string } | undefined;
}

// --- Public types are importable and usable ------------------------------------

export const entry: ProviderEntry<Events> = { provider: { name: "inline", track() {} }, enabled: true };
export const config: AnalyticsConfig<Events> = {
  providers: [entry],
  onError: (error: ProviderError) => {
    void error.providerName;
    void error.eventName;
    void error.error;
  },
};
export const instance: AnalyticsInstance<Events> = createAnalytics<Events>(config);
export type EventNames = keyof EventMap<Events>;

// --- Valid and invalid events --------------------------------------------------

declare const analytics: AnalyticsInstance<Events>;

analytics.track("user_signed_in", { userId: "u-1", method: "google" });
analytics.track("order_completed", { orderId: "o-1", totalPrice: 10, itemsCount: 1 });

// @ts-expect-error unknown event name
analytics.track("user_signed_up");
// @ts-expect-error unknown event name, even with a payload
analytics.track("user_signed_up", { userId: "u-1" });
// @ts-expect-error required payload missing
analytics.track("user_signed_in");
// @ts-expect-error wrong property type
analytics.track("user_signed_in", { userId: 1, method: "email" });
// @ts-expect-error value outside the literal union
analytics.track("user_signed_in", { userId: "u-1", method: "github" });
// @ts-expect-error missing required property
analytics.track("order_completed", { orderId: "o-1" });
// @ts-expect-error unknown property
analytics.track("product_viewed", { productId: "p", productName: "n", price: 1, colour: "red" });

// --- Absent and optional payloads ---------------------------------------------

analytics.track("user_signed_out"); // payloadless event: no argument
// @ts-expect-error a payloadless event rejects a payload
analytics.track("user_signed_out", {});
analytics.track("search_performed"); // payload type includes undefined: may be omitted
analytics.track("search_performed", { query: "boxes" });
// @ts-expect-error wrong type for an optional payload
analytics.track("search_performed", { query: 42 });

// --- Provider narrowing, exhaustiveness and readonly --------------------------

export const narrowing: AnalyticsProvider<Events> = {
  name: "narrowing",
  track(event) {
    switch (event.name) {
      case "user_signed_in": {
        const method: "email" | "google" = event.payload.method;
        void method;
        break;
      }
      case "product_viewed": {
        const price: number = event.payload.price;
        void price;
        break;
      }
      case "order_completed": {
        const total: number = event.payload.totalPrice;
        void total;
        break;
      }
      case "search_performed": {
        const query: string | undefined = event.payload?.query;
        void query;
        break;
      }
      case "user_signed_out": {
        const payload: undefined = event.payload;
        void payload;
        break;
      }
      default: {
        // Exhaustive: every event is handled, so `event` is `never` here.
        const unhandled: never = event;
        void unhandled;
      }
    }
  },
};

export const incomplete: AnalyticsProvider<Events> = {
  name: "incomplete",
  track(event) {
    switch (event.name) {
      case "user_signed_in":
        break;
      default: {
        // @ts-expect-error not exhaustive: other events are still possible
        const unhandled: never = event;
        void unhandled;
      }
    }
  },
};

export const readonlyChecks: AnalyticsProvider<Events> = {
  name: "readonly",
  track(event) {
    // @ts-expect-error event.name is readonly
    event.name = event.name;
    if (event.name === "user_signed_in") {
      // @ts-expect-error event.payload is readonly
      event.payload = event.payload;
      // @ts-expect-error top-level payload properties are readonly
      event.payload.userId = "other";
    }
  },
};

// --- Provider compatibility ---------------------------------------------------

declare const genericProvider: AnalyticsProvider; // untyped: accepts any event
export const withGeneric = createAnalytics<Events>({ providers: [{ provider: genericProvider }] });

interface OtherEvents {
  page_viewed: { path: string };
}
declare const otherProvider: AnalyticsProvider<OtherEvents>;
export const withIncompatible = createAnalytics<Events>({
  // @ts-expect-error a provider for an unrelated event map is rejected
  providers: [{ provider: otherProvider }],
});

// --- Inaccessible internals ---------------------------------------------------

// @ts-expect-error TrackArgs is internal and not exported
import type { TrackArgs } from "box-multi-tracker";
// @ts-expect-error DefaultEvents is internal and not exported
import type { DefaultEvents } from "box-multi-tracker";
// @ts-expect-error there is no `Analytics` class
import type { Analytics } from "box-multi-tracker";
// @ts-expect-error internal modules are not reachable (exports map)
import type * as InternalTypes from "box-multi-tracker/dist/types.js";
// @ts-expect-error internal modules are not reachable (exports map)
import type * as InternalAnalytics from "box-multi-tracker/dist/analytics.js";

export type _EventUnion = AnalyticsEvent<Events>;
