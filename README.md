# box-multi-tracker

A small, framework-agnostic TypeScript library for sending one analytics event to many analytics providers.

- **Typed events.** You define your application's events and payloads; the compiler checks every `track` call.
- **Provider-agnostic Core.** The library contains no vendor code. Providers (GTM, Mixpanel, your own HTTP endpoint, ...) are written by your application and injected.
- **Failure isolation.** A provider that throws or rejects never stops other providers and never throws into your application.
- **Zero runtime dependencies**, ESM-only, no browser or Node APIs.

## Contents

- [Requirements and compatibility](#requirements-and-compatibility)
- [Installation](#installation)
- [Quick start](#quick-start)
- [Defining your events](#defining-your-events)
- [Implementing a provider](#implementing-a-provider)
- [Creating an instance and registering providers](#creating-an-instance-and-registering-providers)
- [Tracking events](#tracking-events)
- [Enabling and disabling providers](#enabling-and-disabling-providers)
- [Error handling and isolation](#error-handling-and-isolation)
- [Dispatch behavior](#dispatch-behavior)
- [Instance state and isolation](#instance-state-and-isolation)
- [API reference](#api-reference)
- [Out of scope](#out-of-scope)
- [Development](#development)

## Requirements and compatibility

- **ESM only.** The package is distributed as ES modules with no CommonJS build. Use `import`. On Node.js versions that cannot `require()` ES modules (before 20.19 and 22.12), `require("box-multi-tracker")` fails with `ERR_REQUIRE_ESM`; use `import` or dynamic `import()` instead.
- **Node.js.** The library uses no Node-specific APIs and emits plain ES2022. The built package was smoke-tested on Node.js 16.20, 18.20, 20.14, 20.20 and 22.17. Use a currently maintained Node.js release.
- **Browsers and bundlers.** No DOM APIs are used. Any ESM-aware bundler works.
- **TypeScript.** Type declarations are included. Verified with TypeScript 7 using `module`/`moduleResolution` set to `NodeNext` and to `Bundler`.

## Installation

```bash
npm install box-multi-tracker
```

or with another package manager:

```bash
pnpm add box-multi-tracker
yarn add box-multi-tracker
```

The package ships compiled JavaScript (`dist/`), type declarations and source maps (with the original TypeScript embedded). It has no runtime dependencies.

## Quick start

```ts
import { createAnalytics } from "box-multi-tracker";
import type { AnalyticsProvider } from "box-multi-tracker";

// 1. Describe your events.
interface AppEvents {
  user_registered: { userId: string };
  logout: undefined;
}

// 2. Write (or import) providers for your events.
const consoleProvider: AnalyticsProvider<AppEvents> = {
  name: "console",
  track(event) {
    console.log(event.name, event.payload);
  },
};

// 3. Create an instance and inject the providers.
const analytics = createAnalytics<AppEvents>({
  providers: [{ provider: consoleProvider }],
});

// 4. Track.
analytics.track("user_registered", { userId: "123" });
analytics.track("logout");
```

## Defining your events

Events belong to your application, not to this library. Describe them with an `interface` (or a `type`) that maps each event name to its payload type:

```ts
interface AppEvents {
  user_registered: { userId: string };                    // payload required
  order_created: { orderId: string; amount: number };     // payload required
  search: { query: string } | undefined;                  // payload optional
  logout: undefined;                                      // no payload
}
```

Rules:

- Every payload must be an object type, or `undefined`.
- A payload type that includes `undefined` makes the payload optional in `track`.
- Plain `interface` declarations work; you don't need an index signature.

Pass the event map to `createAnalytics<AppEvents>(...)` explicitly. Doing so also types the providers you register.

## Implementing a provider

A provider is any object with a unique `name` and a `track` method. `track` may be synchronous or return a promise.

```ts
interface AnalyticsProvider<T> {
  readonly name: string;
  track(event: AnalyticsEvent<T>): void | Promise<void>;
}
```

The `event` is `{ name, payload }`, typed as a discriminated union over your event map, so `switch (event.name)` narrows the payload.

### A synchronous provider (class)

Vendor-specific mapping (event names, payload shape, vendor configuration) lives inside the provider, never in this library.

```ts
import type { AnalyticsEvent, AnalyticsProvider } from "box-multi-tracker";
import type { AppEvents } from "./events";

interface VendorClient {
  send(eventName: string, params: Record<string, unknown>): void;
}

export class VendorProvider implements AnalyticsProvider<AppEvents> {
  readonly name = "vendor";

  constructor(private readonly client: VendorClient) {}

  track(event: AnalyticsEvent<AppEvents>): void {
    switch (event.name) {
      case "user_registered":
        this.client.send("sign_up", { user_id: event.payload.userId });
        break;
      case "order_created":
        this.client.send("purchase", {
          id: event.payload.orderId,
          value: event.payload.amount,
        });
        break;
      default:
        // This vendor does not care about the other events: ignore them.
        break;
    }
  }
}
```

### An asynchronous provider (object)

```ts
import type { AnalyticsProvider } from "box-multi-tracker";
import type { AppEvents } from "./events";

export function createHttpProvider(endpoint: string): AnalyticsProvider<AppEvents> {
  return {
    name: "http",
    async track(event) {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ event: event.name, data: event.payload }),
      });
      if (!response.ok) {
        // Rejections are reported to `onError`; they never reach your app.
        throw new Error(`Analytics request failed with status ${response.status}`);
      }
    },
  };
}
```

### Provider contract

- **`name` must be unique** within one instance. It is used to enable, disable and query the provider, and to attribute errors.
- **Every enabled provider receives every event.** Core does not filter or route events. If a provider only cares about some events, it must ignore the others itself (as in the `default` branch above).
- **Type your provider for the whole event map.** Use `AnalyticsProvider<AppEvents>`, or the untyped `AnalyticsProvider` (which accepts any event) for generic providers. A provider typed for only some of your events is not a supported way to subscribe to a subset; TypeScript may accept it because `track` is declared as a method, but it will still receive every event.
- **Do not mutate the received event or its payload.** See [Shared event object](#shared-event-object).
- **Provider setup belongs to the provider.** Configure and initialize vendor SDKs in your provider's constructor or factory. This library has no init, flush or shutdown hooks.

## Creating an instance and registering providers

```ts
import { createAnalytics } from "box-multi-tracker";
import { createHttpProvider } from "./http-provider";
import { VendorProvider } from "./vendor-provider";
import type { AppEvents } from "./events";

const analytics = createAnalytics<AppEvents>({
  providers: [
    { provider: new VendorProvider(vendorClient) }, // vendorClient: your vendor SDK client
    { provider: createHttpProvider("/analytics/events"), enabled: false },
  ],
  onError: ({ providerName, eventName, error }) => {
    // Forward to your own error monitoring.
    myErrorReporter.capture(error, { providerName, eventName });
  },
});
```

Configuration:

| Field | Type | Description |
| --- | --- | --- |
| `providers` | `ReadonlyArray<{ provider, enabled? }>` | Providers to register, in the order they will be invoked. An empty array is valid. |
| `providers[].enabled` | `boolean` (optional) | Initial enabled state. Defaults to `true`. |
| `onError` | `(error: ProviderError) => void` (optional) | Called when a provider fails. See [Error handling and isolation](#error-handling-and-isolation). |

Construction rules:

- **Duplicate provider names throw** when `createAnalytics` is called (`Duplicate analytics provider name: "..."`).
- The configuration is **read once**. Changing the original `providers` array or its entry objects afterwards has no effect on the instance.

## Tracking events

```ts
analytics.track("user_registered", { userId: "123" });
analytics.track("order_created", { orderId: "A-1", amount: 250000 });
analytics.track("search");                         // optional payload omitted
analytics.track("search", { query: "boxes" });
analytics.track("logout");                         // no payload
```

The compiler rejects mistakes:

```ts
analytics.track("not_an_event");                           // unknown event name
analytics.track("user_registered");                        // required payload missing
analytics.track("user_registered", { userId: 123 });       // wrong payload type
analytics.track("user_registered", { userId: "1", x: 1 }); // unknown property
analytics.track("logout", {});                             // payload not allowed
```

`track()` returns `void`. It does not wait for providers and does not throw because of a provider failure.

## Enabling and disabling providers

```ts
analytics.disableProvider("http");
analytics.isProviderEnabled("http"); // false

analytics.enableProvider("http");
analytics.isProviderEnabled("http"); // true
```

Behavior:

- **Events sent while a provider is disabled are dropped.** They are not queued and are not replayed when the provider is enabled again.
- **Changes apply from the next `track()` call.** The set of enabled providers is captured at the start of each `track()`. If a provider enables or disables another provider while handling an event, the current event is still delivered according to the state when `track()` began.
- `enableProvider` and `disableProvider` **throw** for an unknown name, with a message listing the registered providers.
- `isProviderEnabled` returns **`false`** for an unknown name; it never throws.

## Error handling and isolation

A failing provider cannot prevent other providers from receiving the event, and its failure never throws back into your application.

```ts
const analytics = createAnalytics<AppEvents>({
  providers: [/* ... */],
  onError: ({ providerName, eventName, error }) => {
    // providerName: the failing provider's `name`
    // eventName:    the event being tracked
    // error:        whatever the provider threw or rejected with (unknown)
  },
});
```

What is isolated:

- **Synchronous exceptions** thrown by `provider.track()` are caught and reported to `onError` synchronously, before `track()` returns.
- **Promise rejections** returned by `provider.track()` are observed (so there is no unhandled rejection) and reported to `onError` once the promise rejects.
- **Unusual thenables** (a `then` that throws, a throwing `then` getter, repeated settlement) are handled the same way, and reported at most once.
- **A provider that never settles** its promise does not block the caller or other providers.
- **A failing `onError`** is swallowed: a synchronous throw, a rejected promise, or a thenable that misbehaves cannot break tracking.

Other details:

- Without `onError`, provider failures are silently ignored. The library never logs to the console.
- `ProviderError` contains exactly `providerName`, `eventName` and `error`. **The event payload is deliberately never included**, so personal data is not forwarded to error reporting.
- `error` is typed `unknown` because providers can throw anything.

## Dispatch behavior

### Registration order and synchronous invocation

On each `track()` call, enabled providers are invoked **in registration order**, **synchronously**, one after another, before `track()` returns. Core does not `await` providers:

- Calls are issued in order, but asynchronous providers may complete in any order.
- A slow synchronous provider blocks the caller, and also delays the providers after it. Keep synchronous `track` implementations fast, or return a promise for slow work.

### Shared event object

Core creates **one** `{ name, payload }` object per `track()` call and passes that same object to every enabled provider. The `payload` is the exact object you passed to `track()` (it is not cloned).

- The event and its payload are `readonly` at the type level. This is **shallow**: nested objects inside a payload are not protected by the types.
- At runtime nothing is cloned or frozen.
- **Providers must not mutate the event or the payload.** A mutation would be visible to every provider invoked after it, and to your own payload object.

## Instance state and isolation

`createAnalytics` returns a fresh instance each time. All of its state (the registered providers, their enabled flags, and `onError`) lives in a closure belonging to that call.

```ts
const a = createAnalytics<AppEvents>({ providers: [{ provider: vendor }] });
const b = createAnalytics<AppEvents>({ providers: [{ provider: vendor }] });

a.disableProvider("vendor");
a.isProviderEnabled("vendor"); // false
b.isProviderEnabled("vendor"); // true: unaffected
```

- There is no global state and no singleton. Create an instance where you need one and share it as you see fit.
- The returned methods do not use `this`, so they work when destructured or passed as callbacks:

  ```ts
  const { track } = analytics;
  track("logout");
  ```

## API reference

```ts
function createAnalytics<T extends EventMap<T> = DefaultEvents>(
  config: AnalyticsConfig<T>,
): AnalyticsInstance<T>;

interface AnalyticsInstance<T> {
  track<K extends keyof T & string>(name: K, ...args: TrackArgs<T, K>): void;
  enableProvider(name: string): void;
  disableProvider(name: string): void;
  isProviderEnabled(name: string): boolean;
}

interface AnalyticsConfig<T> {
  providers: ReadonlyArray<ProviderEntry<T>>;
  onError?: (error: ProviderError) => void;
}

interface ProviderEntry<T> {
  provider: AnalyticsProvider<T>;
  enabled?: boolean; // default: true
}

interface AnalyticsProvider<T> {
  readonly name: string;
  track(event: AnalyticsEvent<T>): void | Promise<void>;
}

interface ProviderError {
  providerName: string;
  eventName: string;
  error: unknown;
}
```

Exported values: `createAnalytics`.

Exported types: `AnalyticsInstance`, `AnalyticsConfig`, `ProviderEntry`, `AnalyticsProvider`, `AnalyticsEvent`, `ProviderError`, `EventMap`.

## Out of scope

This library intentionally does only what is described above. It has no `identify`, `reset`, `init`, `flush` or `shutdown` APIs, and no buffering, retries, batching, persistence or event filtering. Vendor integrations are written by the consuming application.

## Development

```bash
npm install
npm run typecheck   # type-check sources and tests
npm test            # runtime tests and compile-time (type) tests
npm run build       # compile to dist/
npm run clean       # remove dist/
```

- Running the test suite needs Node.js 22.12 or newer (a Vitest requirement). Consuming the built package does not.
- `npm install` in a clone of the repository also runs `npm run build` (through the `prepare` script), as do `npm pack` and `npm publish`.
- The design and its rationale are documented in `ARCHITECTURE.md` in the repository. It is a development document and is not part of the installed package.
