import { describe, expectTypeOf, test } from "vitest";
import type {
  AnalyticsConfig,
  AnalyticsEvent,
  AnalyticsInstance,
  AnalyticsProvider,
  EventMap,
  ProviderEntry,
  ProviderError,
} from "../src/index.js";
import type { TrackArgs } from "../src/types.js";

// Fixtures. Deliberately `interface`s, not `type` aliases.
interface AppEvents {
  user_registered: { userId: string };
  order_created: { orderId: string; amount: number };
  search: { query: string } | undefined; // optional payload
  logout: undefined; // payloadless
}

// Disjoint from AppEvents: no event name in common.
interface OtherEvents {
  page_viewed: { path: string };
}

// Same event name as AppEvents, incompatible payload.
interface MismatchedEvents {
  order_created: { orderId: number };
}

interface NestedEvents {
  checkout: { cart: { total: number } };
}

// Declared at module level (never executed): ambient values used by the tests.
declare const analytics: AnalyticsInstance<AppEvents>;
declare const genericProvider: AnalyticsProvider; // defaults to DefaultEvents
declare const typedProvider: AnalyticsProvider<AppEvents>;
declare const otherProvider: AnalyticsProvider<OtherEvents>;
declare const mismatchedProvider: AnalyticsProvider<MismatchedEvents>;
declare const event: AnalyticsEvent<AppEvents>;
declare const registered: Extract<AnalyticsEvent<AppEvents>, { name: "user_registered" }>;
declare const nested: Extract<AnalyticsEvent<NestedEvents>, { name: "checkout" }>;

describe("EventMap", () => {
  test("accepts interface-based event maps", () => {
    expectTypeOf<AppEvents extends EventMap<AppEvents> ? true : false>().toEqualTypeOf<true>();
    expectTypeOf<AnalyticsInstance<AppEvents>>().not.toBeAny();
  });

  test("rejects event maps whose payloads are not objects or undefined", () => {
    // @ts-expect-error payload must be `object | undefined`
    type Invalid = AnalyticsInstance<{ bad_event: string }>;
    expectTypeOf<Invalid>().not.toBeAny();
  });
});

describe("AnalyticsInstance.track", () => {
  test("accepts valid event names and payloads", () => {
    analytics.track("user_registered", { userId: "123" });
    analytics.track("order_created", { orderId: "1", amount: 250000 });
  });

  test("rejects unknown event names", () => {
    // @ts-expect-error unknown event name
    analytics.track("not_an_event");
    // @ts-expect-error unknown event name, even with a payload
    analytics.track("not_an_event", { userId: "123" });
  });

  test("rejects invalid payload shapes", () => {
    // @ts-expect-error wrong property type
    analytics.track("user_registered", { userId: 123 });
    // @ts-expect-error missing required property
    analytics.track("order_created", { orderId: "1" });
    // @ts-expect-error unknown extra property
    analytics.track("user_registered", { userId: "123", extra: true });
  });

  test("requires a payload for events with a required payload", () => {
    // @ts-expect-error payload is required
    analytics.track("user_registered");
    expectTypeOf<TrackArgs<AppEvents, "user_registered">>().toEqualTypeOf<
      [payload: { userId: string }]
    >();
  });

  test("allows omitting the payload when its type includes undefined", () => {
    analytics.track("logout");
    analytics.track("search");
    analytics.track("search", { query: "boxes" });
    expectTypeOf<TrackArgs<AppEvents, "logout">>().toEqualTypeOf<[payload?: undefined]>();
    expectTypeOf<TrackArgs<AppEvents, "search">>().toEqualTypeOf<
      [payload?: { query: string } | undefined]
    >();
  });

  test("rejects a payload for a payloadless event", () => {
    // @ts-expect-error `logout` has no payload
    analytics.track("logout", {});
  });

  test("returns void", () => {
    expectTypeOf(analytics.track).returns.toEqualTypeOf<void>();
  });
});

describe("AnalyticsInstance provider management", () => {
  test("exposes enable, disable and query by name", () => {
    expectTypeOf(analytics.enableProvider).toEqualTypeOf<(name: string) => void>();
    expectTypeOf(analytics.disableProvider).toEqualTypeOf<(name: string) => void>();
    expectTypeOf(analytics.isProviderEnabled).toEqualTypeOf<(name: string) => boolean>();
  });
});

describe("provider compatibility", () => {
  test("accepts a provider typed for the same event map", () => {
    const entry: ProviderEntry<AppEvents> = { provider: typedProvider };
    expectTypeOf(entry.provider).toEqualTypeOf<AnalyticsProvider<AppEvents>>();
  });

  test("accepts a generic provider (DefaultEvents) in AnalyticsConfig<AppEvents>", () => {
    const config: AnalyticsConfig<AppEvents> = {
      providers: [{ provider: genericProvider }, { provider: typedProvider, enabled: false }],
    };
    expectTypeOf(config.providers).toEqualTypeOf<ReadonlyArray<ProviderEntry<AppEvents>>>();
  });

  test("rejects a provider with an unrelated event map", () => {
    const entry: ProviderEntry<AppEvents> = {
      // @ts-expect-error OtherEvents shares no events with AppEvents
      provider: otherProvider,
    };
    expectTypeOf(entry).not.toBeAny();
  });

  test("rejects a provider whose payload type conflicts", () => {
    const entry: ProviderEntry<AppEvents> = {
      // @ts-expect-error `order_created` payload differs
      provider: mismatchedProvider,
    };
    expectTypeOf(entry).not.toBeAny();
  });

  test("onError receives a ProviderError without a payload", () => {
    const config: AnalyticsConfig<AppEvents> = {
      providers: [],
      onError: (error) => {
        expectTypeOf(error).toEqualTypeOf<ProviderError>();
      },
    };
    expectTypeOf(config.onError).not.toBeAny();
    expectTypeOf<ProviderError>().toEqualTypeOf<{
      providerName: string;
      eventName: string;
      error: unknown;
    }>();
  });

  test("allows an empty provider list", () => {
    const config: AnalyticsConfig<AppEvents> = { providers: [] };
    expectTypeOf(config).not.toBeAny();
  });
});

describe("AnalyticsEvent", () => {
  test("is a discriminated union of the event names", () => {
    expectTypeOf<AnalyticsEvent<AppEvents>["name"]>().toEqualTypeOf<
      "user_registered" | "order_created" | "search" | "logout"
    >();
  });

  test("narrows the payload when switching on event.name", () => {
    const provider: AnalyticsProvider<AppEvents> = {
      name: "narrowing",
      track(e) {
        switch (e.name) {
          case "user_registered":
            expectTypeOf(e.payload).toEqualTypeOf<{ readonly userId: string }>();
            break;
          case "order_created":
            expectTypeOf(e.payload).toEqualTypeOf<{
              readonly orderId: string;
              readonly amount: number;
            }>();
            break;
          case "search":
            expectTypeOf(e.payload).toEqualTypeOf<{ readonly query: string } | undefined>();
            break;
          case "logout":
            expectTypeOf(e.payload).toEqualTypeOf<undefined>();
            break;
        }
      },
    };
    expectTypeOf(provider).not.toBeAny();
  });

  test("supports exhaustive handling via never", () => {
    const exhaustive: AnalyticsProvider<AppEvents> = {
      name: "exhaustive",
      track(e) {
        switch (e.name) {
          case "user_registered":
          case "order_created":
          case "search":
          case "logout":
            break;
          default:
            expectTypeOf(e).toBeNever();
        }
      },
    };

    const incomplete: AnalyticsProvider<AppEvents> = {
      name: "incomplete",
      track(e) {
        switch (e.name) {
          case "user_registered":
          case "order_created":
          case "search":
            break;
          default:
            // @ts-expect-error `logout` is not handled, so `e` is not `never`
            const unhandled: never = e;
            return unhandled;
        }
      },
    };

    expectTypeOf(exhaustive).not.toBeAny();
    expectTypeOf(incomplete).not.toBeAny();
  });

  test("makes event name and payload readonly", () => {
    // @ts-expect-error `name` is readonly
    event.name = event.name;
    // @ts-expect-error `payload` is readonly
    registered.payload = registered.payload;
  });

  test("makes top-level payload properties readonly", () => {
    // @ts-expect-error `userId` is readonly
    registered.payload.userId = "456";
  });

  test("keeps readonly shallow: nested objects stay mutable", () => {
    nested.payload.cart.total = 10;
    // @ts-expect-error `cart` is a top-level payload property
    nested.payload.cart = { total: 10 };
  });
});
