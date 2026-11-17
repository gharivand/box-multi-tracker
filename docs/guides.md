# Usage guides

Practical, copyable guides for `box-multi-tracker`. The [README](../README.md) is the full reference; these guides show how the pieces fit together in a real application.

The examples share one running scenario: a small shop that tracks sign-ins, product views, searches and orders. Each TypeScript block is a complete file, named in its first line. `events.ts`, `providers.ts` and `analytics.ts` are imported by the files that follow; the instance files in sections 5 to 9 are self-contained alternatives to `analytics.ts`, not additions to it. Relative imports are written without extensions (bundler style); add `.js` if you use `moduleResolution: "NodeNext"`.

1. [Defining events and type safety](#1-defining-events-and-type-safety)
2. [Creating an analytics instance](#2-creating-an-analytics-instance)
3. [Implementing a custom provider](#3-implementing-a-custom-provider)
4. [Managing providers](#4-managing-providers)
5. [Error handling](#5-error-handling)
6. [Event validation](#6-event-validation)
7. [Using the Zod adapter](#7-using-the-zod-adapter)
8. [Using the Sentry adapter](#8-using-the-sentry-adapter)
9. [Using the debug logger](#9-using-the-debug-logger)

## 1. Defining events and type safety

An event map is a TypeScript `interface` (or type) that maps each event name to its payload type. A payload must be an object, or `undefined` for events that carry no data.

```ts
// events.ts
export interface AppEvents {
  user_signed_in: { userId: string; method: "email" | "google" };
  product_viewed: { productId: string; price: number };
  order_completed: { orderId: string; total: number; itemCount: number };
  search_performed: { query: string } | undefined; // payload is optional
  user_signed_out: undefined; // no payload
}
```

- **Required payload:** `{ ... }` only. `track` demands it.
- **Optional payload:** `{ ... } | undefined`. `track` accepts it with or without the payload.
- **No payload:** `undefined`. `track` accepts only the event name.

Once an instance is created with this map (next section), the compiler checks every `track` call:

```ts
// type-safe-tracking.ts
import { analytics } from "./analytics";

analytics.track("user_signed_in", { userId: "u-42", method: "google" });
analytics.track("search_performed"); // optional payload omitted
analytics.track("search_performed", { query: "gift boxes" });
analytics.track("user_signed_out"); // no payload

// @ts-expect-error: unknown event name
analytics.track("order_refunded", { orderId: "A-1" });

// @ts-expect-error: required payload is missing
analytics.track("product_viewed");

// @ts-expect-error: wrong payload type (price must be a number)
analytics.track("product_viewed", { productId: "p-1", price: "12.50" });

// @ts-expect-error: unknown property
analytics.track("user_signed_in", { userId: "u-42", method: "email", plan: "pro" });

// @ts-expect-error: this event takes no payload
analytics.track("user_signed_out", {});
```

Providers see the same map as a discriminated union, so `switch (event.name)` narrows `event.payload` (shown in [section 3](#3-implementing-a-custom-provider)). See the README on [defining events](../README.md#defining-your-events) and [tracking](../README.md#tracking-events).

## 2. Creating an analytics instance

`createAnalytics` takes a configuration object and returns an independent instance. Pass your event map as the type argument so providers and `track` are typed.

The `providers` array is where you register your event destinations. Each entry is one independent provider; this example registers three.

```ts
// analytics.ts
import { createAnalytics } from "box-multi-tracker";
import type { AnalyticsProvider } from "box-multi-tracker";
import type { AppEvents } from "./events";
import { createHttpProvider, createVendorProvider } from "./providers"; // written in section 3
import type { VendorClient } from "./providers";

// Stand-in for a third-party analytics SDK such as Google Analytics. No real SDK is imported.
const vendorClient: VendorClient = {
  send: (eventName, properties) => console.log("vendor:", eventName, properties),
};

// Three independent destinations.
const googleProvider = createVendorProvider(vendorClient); // a third-party analytics tool
const backendProvider = createHttpProvider("/api/analytics"); // your own backend

const loggingProvider: AnalyticsProvider<AppEvents> = {
  name: "logging", // the console, handy during development
  track(event) {
    console.log("[analytics]", event.name, event.payload);
  },
};

export const analytics = createAnalytics<AppEvents>({
  providers: [
    { provider: googleProvider },
    { provider: backendProvider },
    { provider: loggingProvider },
  ],
  onError: ({ providerName, eventName, error }) => {
    console.error(`Analytics provider "${providerName}" failed on "${eventName}"`, error);
  },
});
```

One `track` call reaches all three providers:

```ts
// track-order.ts
import { analytics } from "./analytics";

// googleProvider, backendProvider and loggingProvider each receive this event, in that order.
analytics.track("order_completed", { orderId: "A-1", total: 250000, itemCount: 2 });
```

How multiple providers work:

- **Each provider is an independent event destination.** It has its own `name` and its own `track`, and it decides what to do with an event.
- **Every enabled provider receives every valid event.** Core does not filter or route by provider. (Events rejected by a [validator](#6-event-validation) reach none of them.)
- **Providers are called in registration order**: `googleProvider`, then `backendProvider`, then `loggingProvider`. Each call is made one after another, synchronously, before `track()` returns. Core does not wait for asynchronous providers, and a provider that fails is reported to `onError` without stopping the next one ([section 5](#5-error-handling)).
- **Adding a destination means adding one entry.** Neither Core nor the existing providers change.
- **Providers do not know about each other.** None of them depends on, calls or sees another one; each only receives the event.

What the configuration means:

| Option | Required | Meaning |
| --- | --- | --- |
| `providers` | yes | `{ provider, enabled? }` entries. `enabled` defaults to `true`; use `enabled: false` to register a provider that stays off until you call `enableProvider` ([section 4](#4-managing-providers)). |
| `onError` | no | Called when a provider throws or rejects. See [section 5](#5-error-handling). |
| `validator` | no | Validates (and may transform) every payload before dispatch. See [section 6](#6-event-validation). |
| `onValidationError` | no | Called when validation rejects an event. See [section 5](#5-error-handling). |

Things to know:

- **Provider names must be unique.** `createAnalytics` throws on a duplicate name.
- **The configuration is read once.** Changing the `config` object (or its `providers` array) afterwards has no effect.
- **There is no global state.** Each call creates a separate instance; create one where you need it and export it, as above.

See the README on [creating an instance](../README.md#creating-an-instance-and-registering-providers).

## 3. Implementing a custom provider

A provider is an object with a unique `name` and a `track` method that receives one event.

```ts
// providers.ts
import type { AnalyticsProvider } from "box-multi-tracker";
import type { AppEvents } from "./events";

/** The small part of a vendor SDK this example uses. */
export interface VendorClient {
  send(eventName: string, properties: Record<string, unknown>): void;
}

/** A synchronous provider that maps some events to a vendor SDK and ignores the rest. */
export function createVendorProvider(client: VendorClient): AnalyticsProvider<AppEvents> {
  return {
    name: "vendor",
    track(event) {
      switch (event.name) {
        case "order_completed":
          // `event.payload` is narrowed to the order_completed payload here.
          client.send("Order Completed", {
            order_id: event.payload.orderId,
            revenue: event.payload.total,
            items: event.payload.itemCount,
          });
          break;
        case "user_signed_out":
          client.send("Signed Out", {});
          break;
        default:
          break; // this vendor does not care about the other events
      }
    },
  };
}

/** An asynchronous provider: `track` may return a promise. */
export function createHttpProvider(endpoint: string): AnalyticsProvider<AppEvents> {
  return {
    name: "http",
    async track(event) {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: event.name, payload: event.payload }),
      });
      if (!response.ok) {
        // A rejection is reported to `onError`; it does not affect other providers.
        throw new Error(`Analytics endpoint responded with ${response.status}`);
      }
    },
  };
}
```

The provider contract:

- **`name`** is unique within one instance. It is how you enable, disable and identify the provider, and it appears in error reports.
- **`track(event)`** receives `{ name, payload }`. It may be synchronous (return nothing) or asynchronous (return a `Promise<void>`).
- **Receive everything, ignore what you don't need.** Core sends every event to every enabled provider. There are no per-provider filters, so a provider that cares about a few events handles them in a `switch` and ignores the rest, as above. A provider typed for a *subset* of your events is not a supported way to subscribe.
- **Failures are yours to throw.** A synchronous throw, or a returned promise that rejects, is reported to `onError`. Core does not retry, queue or batch.
- **Do not mutate the event or its payload.** The same event object is shared by every provider and nothing is cloned or frozen. The types are `readonly` (shallowly) to help.
- **A slow synchronous `track` blocks the caller and the providers after it.** Do slow work asynchronously.

For a provider that works with any event map, use the untyped `AnalyticsProvider` (no type argument). See the README on [implementing a provider](../README.md#implementing-a-provider) and the [provider contract](../README.md#provider-contract).

## 4. Managing providers

Every instance has three methods for switching providers by `name`. A provider registered with `enabled: false` starts switched off, and receives nothing until you enable it.

```ts
// provider-controls.ts
import { analytics } from "./analytics";

analytics.isProviderEnabled("http"); // true: providers are enabled by default

analytics.disableProvider("http");
analytics.isProviderEnabled("http"); // false

analytics.enableProvider("http");
analytics.isProviderEnabled("http"); // true

analytics.isProviderEnabled("nope"); // false: an unknown name never throws here

// enableProvider and disableProvider throw for an unknown name, with a message that lists the registered providers.
try {
  analytics.enableProvider("nope");
} catch (error) {
  console.error(error);
}
```

A typical use is reacting to a consent choice:

```ts
// consent.ts
import { analytics } from "./analytics";

export function onConsentChanged(granted: boolean): void {
  if (granted) {
    analytics.enableProvider("http");
  } else {
    analytics.disableProvider("http");
  }
}
```

What happens:

- **A disabled provider receives nothing.** Events tracked while it is disabled are dropped for that provider. They are not queued and are not replayed when it is enabled again.
- **Other providers are unaffected.** Enabled providers keep receiving every event.
- **Changes apply from the next `track()` call.** The enabled providers are captured when `track()` starts, so a change made while an event is being delivered affects only later events.
- **Nothing is called on the provider itself.** Enabling or disabling only flips a flag inside the instance; there is no setup or teardown hook.
- **State belongs to the instance.** Two instances never share enabled flags.

See the README on [enabling and disabling providers](../README.md#enabling-and-disabling-providers).

## 5. Error handling

There are two separate callbacks, because they mean different things:

| Callback | Called when | Event delivered? |
| --- | --- | --- |
| `onError(ProviderError)` | a provider threw or its promise rejected | yes, to the other providers; one provider failed |
| `onValidationError(ValidationError)` | validation rejected the event ([section 6](#6-event-validation)) | no, to no provider |

```ts
// analytics-errors.ts
import { createAnalytics } from "box-multi-tracker";
import type { ProviderError, ValidationError } from "box-multi-tracker";
import type { AppEvents } from "./events";
import { createHttpProvider, createVendorProvider } from "./providers";

function reportProviderError({ providerName, eventName, error }: ProviderError): void {
  // `error` is whatever the provider threw or rejected with, so its type is `unknown`.
  const message = error instanceof Error ? error.message : "non-Error value thrown";
  console.error(`[analytics] provider "${providerName}" failed on "${eventName}": ${message}`);
}

function reportValidationError(report: ValidationError): void {
  if ("cause" in report) {
    // The validator itself threw: a bug in the validator, not in the payload.
    console.error(`[analytics] validator threw on "${report.eventName}"`, report.cause);
  } else {
    console.warn(`[analytics] invalid "${report.eventName}"`, report.issues);
  }
}

export const analytics = createAnalytics<AppEvents>({
  providers: [
    { provider: createVendorProvider({ send: () => {} }) },
    { provider: createHttpProvider("/api/analytics") },
  ],
  onError: reportProviderError,
  onValidationError: reportValidationError,
});
```

What is isolated, and what is not promised:

- **A failing provider does not stop the others.** Every enabled provider is still called, in registration order.
- **`track()` does not throw because of a provider.** A synchronous exception is caught and reported to `onError` before `track()` returns; a rejected promise is observed (no unhandled rejection) and reported when it rejects.
- **A provider that never settles** its promise blocks neither the caller nor other providers.
- **A failing callback is swallowed.** If `onError` or `onValidationError` throws or rejects, tracking is not affected.
- **No payload in reports.** `ProviderError` carries the provider name, the event name and the error; `ValidationError` carries the event name, the issues and, if the validator threw, the `cause`. Neither carries the tracked payload.
- **Without a callback, failures are silently ignored.** The library never logs on its own.
- **No recovery.** Core does not retry, queue, batch or persist failed events.

A validation error with a `cause` property means the validator threw. The check is for the presence of the property, not its value, because a validator can throw `undefined`. See the README on [error handling](../README.md#error-handling-and-isolation) and [validation errors](../README.md#handling-validation-errors).

## 6. Event validation

A validator checks every payload at runtime, before any provider, and may transform it. Without a `validator`, payloads are dispatched unchanged.

A validator is an object with a **synchronous** `validate(name, payload)` function that returns a `ValidationResult`:

- success: `{ success: true, data }`, where `data` is what providers will receive;
- failure: `{ success: false, issues }`, where `issues` is an array of `{ message, path }`.

Async validation is not supported: `validate` must return the result itself, not a Promise.

When a validator transforms payloads there are two event maps: the **input** map (what callers pass to `track`) and the **output** map (what providers receive). This example accepts `total` as a number or a numeric string and delivers a number.

```ts
// analytics-validated.ts
import { createAnalytics } from "box-multi-tracker";
import type { AnalyticsProvider, EventValidator, ValidationResult } from "box-multi-tracker";

// What providers receive.
interface ShopEvents {
  order_completed: { orderId: string; total: number };
  user_signed_out: undefined;
}

// What callers pass to `track`.
interface ShopEventInputs {
  order_completed: { orderId: string; total: number | string };
  user_signed_out: undefined;
}

// One checking function per event, so every event is covered and typed.
const rules: {
  [K in keyof ShopEvents]: (payload: ShopEventInputs[K]) => ValidationResult<ShopEvents[K]>;
} = {
  order_completed(payload) {
    const total = Number(payload.total);
    if (payload.orderId === "" || Number.isNaN(total)) {
      return { success: false, issues: [{ message: "orderId and a numeric total are required", path: [] }] };
    }
    return { success: true, data: { orderId: payload.orderId, total } };
  },
  user_signed_out() {
    return { success: true, data: undefined };
  },
};

const validator: EventValidator<ShopEventInputs, ShopEvents> = {
  validate: (name, payload) => rules[name](payload),
};

const received: unknown[] = [];
const recorder: AnalyticsProvider<ShopEvents> = {
  name: "recorder",
  track(event) {
    received.push(event);
  },
};

// Both event maps are inferred from the validator.
export const analytics = createAnalytics({
  providers: [{ provider: recorder }],
  validator,
  onValidationError: ({ eventName, issues }) => {
    console.warn(`Rejected "${eventName}"`, issues);
  },
});

// Success: the provider receives the transformed payload, { orderId: "A-1", total: 500 }.
analytics.track("order_completed", { orderId: "A-1", total: "500" });

// Failure: no provider is called; onValidationError receives the event name and the issues.
analytics.track("order_completed", { orderId: "A-2", total: "abc" });
```

How validation behaves:

- **It runs once per `track()`**, before the providers, and also when every provider is disabled.
- **On success**, every enabled provider receives the validator's `data` (the same object for all of them), not the object you passed.
- **On failure**, no provider receives the event, `onValidationError` is called with `{ eventName, issues }`, and the event is dropped. It is not queued or retried.
- **`track` is typed with the input map** and providers with the output map, so a payload that does not match the input type is a compile error.
- **If `validate` throws**, the event is not delivered either. `onValidationError` receives a single issue whose message starts with `Validator threw:`, and what was thrown is in `cause`.

Writing a validator by hand for many events is verbose; the [Zod adapter](#7-using-the-zod-adapter) does it from schemas. See the README on [runtime validation](../README.md#runtime-validation) and [the validator contract](../README.md#the-validator-contract).

## 7. Using the Zod adapter

The Zod adapter is **optional** and **not a Core dependency**. Core never imports Zod, and installing `box-multi-tracker` never installs it. Install Zod 4 yourself, and import the adapter from its own entry point:

```bash
npm install zod
```

```ts
// analytics-zod.ts
import { createAnalytics } from "box-multi-tracker";
import type { AnalyticsProvider } from "box-multi-tracker";
import { createZodValidator } from "box-multi-tracker/zod";
import type { InferInputEvents, InferOutputEvents } from "box-multi-tracker/zod";
import { z } from "zod";

// One schema per event. Use z.undefined() for events without a payload.
const schemas = {
  user_signed_in: z.object({
    userId: z.string().min(1),
    method: z.enum(["email", "google"]),
  }),
  order_completed: z.object({
    orderId: z.string(),
    total: z.coerce.number().positive(), // "500" becomes 500
    itemCount: z.number().int().positive(),
  }),
  search_performed: z.object({ query: z.string().trim() }).optional(),
  user_signed_out: z.undefined(),
};

// Types come from the schemas: what `track` accepts, and what providers receive.
export type TrackedInputs = InferInputEvents<typeof schemas>;
export type TrackedEvents = InferOutputEvents<typeof schemas>;

const consoleProvider: AnalyticsProvider<TrackedEvents> = {
  name: "console",
  track(event) {
    console.log("[analytics]", event.name, event.payload);
  },
};

export const analytics = createAnalytics({
  providers: [{ provider: consoleProvider }],
  validator: createZodValidator(schemas),
  onValidationError: ({ eventName, issues }) => {
    for (const issue of issues) {
      console.warn(`Invalid "${eventName}" at ${issue.path.join(".") || "(payload)"}: ${issue.message}`);
    }
  },
});

// Valid: the provider receives { orderId: "A-1", total: 500, itemCount: 2 } (total was coerced).
analytics.track("order_completed", { orderId: "A-1", total: "500", itemCount: 2 });

// Invalid: no provider is called; onValidationError reports the failing field.
analytics.track("order_completed", { orderId: "A-2", total: "-1", itemCount: 2 });

analytics.track("search_performed");
analytics.track("user_signed_out");
```

Notes:

- Valid payloads are delivered as Zod parsed them, so transformations, defaults and coercion reach the providers.
- Each Zod issue becomes `{ message, path }`. No Zod types or errors leave the adapter.
- An event name without a schema (possible only from untyped code) is a validation failure, not an unchecked dispatch.
- Only synchronous schemas are supported. A schema that cannot run synchronously (for example an async refinement) makes the validator throw, which is reported as described in [section 6](#6-event-validation).

See the README on [the Zod adapter](../README.md#the-zod-adapter).

## 8. Using the Sentry adapter

The Sentry adapter is **optional** and **does not initialize Sentry**. Your application installs `@sentry/browser` (version 11), calls `Sentry.init` itself, and only then passes the adapter's handlers to the callbacks that already exist. The adapter never initializes, configures, flushes or queues anything.

```bash
npm install @sentry/browser
```

```ts
// monitoring-sentry.ts
import * as Sentry from "@sentry/browser";
import { createAnalytics } from "box-multi-tracker";
import { createSentryReporter } from "box-multi-tracker/sentry";
import type { AppEvents } from "./events";
import { createHttpProvider, createVendorProvider } from "./providers";

// 1. Your application initializes Sentry. The adapter does not.
Sentry.init({ dsn: "https://examplePublicKey@o0.ingest.sentry.io/0" });

// 2. Create the handlers. `instanceId` is any stable string that identifies this instance.
const sentry = createSentryReporter({ instanceId: "storefront" });

// 3. Plug them into the existing callbacks.
export const analytics = createAnalytics<AppEvents>({
  providers: [
    { provider: createVendorProvider({ send: () => {} }) },
    { provider: createHttpProvider("/api/analytics") },
  ],
  onError: sentry.onProviderError,
  onValidationError: sentry.onValidationError,
});

// To add your own handling as well, call the reporter from your own callback:
//   onError: (error) => { myLogger(error); sentry.onProviderError(error); }
```

What is sent to Sentry:

| Situation | Reported? |
| --- | --- |
| A provider throws or its promise rejects | Yes (tag `error_type=provider_error`) |
| A validator throws | Yes (tag `error_type=validator_exception`) |
| A payload fails validation (an ordinary invalid payload) | No |

- The adapter only ever sees `ProviderError` and `ValidationError`, which carry no payload, so the tracked payload is not sent.
- A thrown value that is not an `Error` is replaced by a fixed message. Validation issue messages are not sent, only their count.
- Messages of thrown `Error`s are sent as written, so keep payload data out of them.
- Sentry's own default integrations (for example console breadcrumbs) are configured in `Sentry.init`, not in the adapter. See the README's [Sentry limitations](../README.md#limitations) before enabling them in production.
- Importing `box-multi-tracker/sentry` without `@sentry/browser` installed fails when the module loads. Core is unaffected.

See the README on [the Sentry adapter](../README.md#the-sentry-adapter).

## 9. Using the debug logger

The debug logger prints the SDK's **failures** to the console while you develop. It is a pair of handlers for the same two callbacks, has no dependencies, and is imported from `box-multi-tracker/debug`. It is **disabled by default**: until you pass `enabled: true`, it writes nothing.

```ts
// monitoring-debug.ts
import { createAnalytics } from "box-multi-tracker";
import { createDebugLogger } from "box-multi-tracker/debug";
import type { AppEvents } from "./events";
import { createHttpProvider, createVendorProvider } from "./providers";

const isDevelopment = import.meta.env.DEV; // Vite; use your bundler's equivalent

const logger = createDebugLogger({
  enabled: isDevelopment, // default: false
  level: "debug", // "error" | "warn" | "debug"; default: "debug"
});

export const analytics = createAnalytics<AppEvents>({
  providers: [
    { provider: createVendorProvider({ send: () => {} }) },
    { provider: createHttpProvider("/api/analytics") },
  ],
  onError: logger.onProviderError,
  onValidationError: logger.onValidationError,
});
```

What it logs (every line starts with `[box-multi-tracker]`):

| Situation | Console method |
| --- | --- |
| A provider throws or rejects | `console.error` |
| A validator throws | `console.error` |
| A payload fails validation (an ordinary invalid payload) | `console.warn` |

```text
[box-multi-tracker] Provider "http" failed while tracking "order_completed": Error: Analytics endpoint responded with 500
[box-multi-tracker] Validation failed for "order_completed" (1 issue)
```

`level` controls how much is written:

| `level` | Writes |
| --- | --- |
| `"error"` | Provider errors and validator exceptions |
| `"warn"` | The above, plus ordinary validation failures |
| `"debug"` (default) | The above, each followed by a `console.debug` line with structured details |

What it does not do:

- **It does not log successful events or provider state changes.** Only failures reach it, because it is wired to the two error callbacks.
- **It does not log the tracked payload.** The handlers receive `ProviderError` and `ValidationError`, which carry no payload. Error messages and validation issues are printed as your providers and validators wrote them, so keep payload data out of them.
- **It never interferes with tracking.** The handlers do not throw and do not return promises.
- **It has no custom sinks or formatting options.** It writes to the global `console`.

To use the logger together with the Sentry adapter, call both from your own callbacks:

```ts
// monitoring-combined.ts
import * as Sentry from "@sentry/browser";
import { createAnalytics } from "box-multi-tracker";
import { createDebugLogger } from "box-multi-tracker/debug";
import { createSentryReporter } from "box-multi-tracker/sentry";
import type { AppEvents } from "./events";
import { createVendorProvider } from "./providers";

Sentry.init({ dsn: "https://examplePublicKey@o0.ingest.sentry.io/0" });

const logger = createDebugLogger({ enabled: true });
const sentry = createSentryReporter({ instanceId: "storefront" });

export const analytics = createAnalytics<AppEvents>({
  providers: [{ provider: createVendorProvider({ send: () => {} }) }],
  onError: (error) => {
    logger.onProviderError(error);
    sentry.onProviderError(error);
  },
  onValidationError: (error) => {
    logger.onValidationError(error);
    sentry.onValidationError(error);
  },
});
```

See the README on [the debug logger](../README.md#the-debug-logger).
