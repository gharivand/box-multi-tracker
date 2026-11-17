# box-multi-tracker

A small, framework-agnostic TypeScript library for sending one analytics event to many analytics providers.

- **Typed events.** You define your application's events and payloads; the compiler checks every `track` call.
- **Provider-agnostic Core.** The library contains no vendor code. Providers (GTM, Mixpanel, your own HTTP endpoint, ...) are written by your application and injected.
- **Failure isolation.** A provider that throws or rejects never stops other providers and never throws into your application.
- **Optional runtime validation.** Plug in a validator to check, and transform, payloads before any provider sees them. A [Zod adapter](#the-zod-adapter) is included as a separate, optional entry point.
- **Optional Sentry reporting.** A small [Sentry adapter](#the-sentry-adapter) reports SDK failures (never payloads) through the existing error callbacks, as a separate, optional entry point.
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
- [Runtime validation](#runtime-validation)
- [The Zod adapter](#the-zod-adapter)
- [The Sentry adapter](#the-sentry-adapter)
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

Runtime validation is optional. To use the Zod adapter, install Zod 4 yourself (it is an optional peer dependency, so installing this package never installs it):

```bash
npm install zod
```

If you do not import `box-multi-tracker/zod`, you do not need Zod.

Sentry reporting is optional as well. To use the Sentry adapter, install `@sentry/browser` 11 yourself (again an optional peer dependency):

```bash
npm install @sentry/browser
```

If you do not import `box-multi-tracker/sentry`, you do not need Sentry. The Core entry point never imports it.

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
| `validator` | `EventValidator` (optional) | Validates, and may transform, every payload before dispatch. See [Runtime validation](#runtime-validation). |
| `onValidationError` | `(error: ValidationError) => void` (optional) | Called when validation rejects an event. Separate from `onError`. |

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

Core creates **one** `{ name, payload }` object per `track()` call and passes that same object to every enabled provider. Without a validator, the `payload` is the exact object you passed to `track()` (it is not cloned). With a [validator](#runtime-validation), it is the validated, possibly transformed, payload the validator returned.

- The event and its payload are `readonly` at the type level. This is **shallow**: nested objects inside a payload are not protected by the types.
- At runtime nothing is cloned or frozen.
- **Providers must not mutate the event or the payload.** A mutation would be visible to every provider invoked after it, and to your own payload object.

## Instance state and isolation

`createAnalytics` returns a fresh instance each time. All of its state (the registered providers, their enabled flags, `onError`, and the optional validator) lives in a closure belonging to that call.

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

## Runtime validation

TypeScript checks your `track` calls at compile time. It cannot check data that arrives at runtime (form input, URL parameters, API responses). Runtime validation does, and it can also normalize payloads before any provider sees them.

Validation is **optional**. Without a `validator`, `track` behaves exactly as described above and nothing extra runs.

### How it works

With a `validator` configured, each `track()` call:

1. calls `validator.validate(name, payload)` once, before any provider;
2. if validation **succeeds**, sends the validator's output (`data`) to every enabled provider. This may differ from what you passed (a transformation);
3. if validation **fails**, sends the event to **no** provider and reports a `ValidationError` to `onValidationError`.

```ts
import { createAnalytics } from "box-multi-tracker";
import type { EventValidator } from "box-multi-tracker";

// What providers receive.
interface AppEvents {
  order_created: { orderId: string; total: number };
}
// What callers pass to `track`.
interface AppEventInputs {
  order_created: { orderId: string; total: number | string };
}

const validator: EventValidator<AppEventInputs, AppEvents> = {
  validate(name, payload) {
    const total = Number(payload.total);
    if (Number.isNaN(total)) {
      return { success: false, issues: [{ message: "total must be a number", path: ["total"] }] };
    }
    return { success: true, data: { orderId: payload.orderId, total } };
  },
};

const analytics = createAnalytics({
  providers: [{ provider: myProvider }], // myProvider: AnalyticsProvider<AppEvents>
  validator,
  onValidationError: ({ eventName, issues }) => {
    console.warn(`Invalid "${eventName}"`, issues);
  },
});

analytics.track("order_created", { orderId: "123", total: "500" }); // providers get { orderId: "123", total: 500 }
analytics.track("order_created", { orderId: "123", total: "abc" }); // no provider is called; onValidationError runs
```

You rarely need to write a validator by hand. The [Zod adapter](#the-zod-adapter) builds one from schemas. (With several events, a hand-written `validate` is generic over the event name, and TypeScript cannot narrow `payload` or the returned `data` per event, so it needs a small cast or a per-event lookup table. The adapter does that once, internally.)

### The validator contract

```ts
interface EventValidator<TInput, T = TInput> {
  readonly validate: <K extends keyof TInput & keyof T & string>(
    name: K,
    payload: TInput[K],
  ) => ValidationResult<T[K]>;
}

type ValidationResult<T> =
  | { readonly success: true; readonly data: T }
  | { readonly success: false; readonly issues: ReadonlyArray<ValidationIssue> };

interface ValidationIssue {
  readonly message: string;
  readonly path: ReadonlyArray<string | number>; // empty for the payload as a whole
}
```

The contract is plain data. It does not mention any validation library, and no library error type crosses it, so any library (or a hand-written function) can implement it.

### Types: input and output

A validator can change a payload's type, so there are two event maps:

- `T` (for example `AppEvents`) is what **providers receive**.
- `TInput` (for example `AppEventInputs`) is what **`track` accepts**. It defaults to `T`.

`createAnalytics({ providers, validator })` infers both from the validator, so you normally write neither. The compiler then enforces:

```ts
analytics.track("order_created", { orderId: "1", total: "500" }); // OK: input type
analytics.track("order_created", { orderId: "1", total: true });  // error: not an input type
analytics.track("order_refunded", { orderId: "1" });              // error: unknown event name
```

and providers are typed with the **output** map (`AnalyticsProvider<AppEvents>`), so they see `total: number`. A validator that does not cover every event, or that produces the wrong output type, is a compile error. Passing two type arguments (`createAnalytics<AppEvents, AppEventInputs>(...)`) requires a `validator`.

### Handling validation errors

Validation failures and provider failures are different things, so they have different callbacks:

| | Callback | Meaning |
| --- | --- | --- |
| Provider threw or rejected | `onError(ProviderError)` | The event was delivered; one provider failed. |
| Validation rejected the event | `onValidationError(ValidationError)` | The event was **not** delivered to any provider. |

```ts
interface ValidationError {
  eventName: string;
  issues: ReadonlyArray<ValidationIssue>;
  cause?: unknown; // only set when the validator itself threw
}
```

- Without `onValidationError`, rejected events are dropped silently.
- `ValidationError` never contains the payload, so personal data is not forwarded to error reporting.
- A failing `onValidationError` (sync throw, rejected promise) is swallowed, like `onError`. It cannot break tracking.
- **A broken validator fails closed.** If `validate` throws, or returns something that is not a `ValidationResult`, the event is not delivered, and `onValidationError` gets one issue (`Validator threw: ...`) with the underlying error in `cause`.
- Validation runs even when every provider is disabled, and it runs once per `track()`, not once per provider.
- Rejected events are dropped, not queued or retried.

## The Zod adapter

`box-multi-tracker/zod` turns Zod schemas into an `EventValidator`. It is a separate entry point: importing `box-multi-tracker` never loads it, and the Core never imports Zod.

**Why an adapter?** The Core has no runtime dependencies and no opinion about validation libraries. Zod support is opt-in, so you only install and depend on Zod if you want it. Any other library can plug into the same contract.

**Requirements.** Zod 4 (`zod@^4`), installed by you. It is an optional peer dependency. The adapter imports only Zod's *types*, and calls the `safeParse` method of the schemas you give it.

### Defining event schemas

One schema per event, keyed by event name. Use `z.undefined()` for payloadless events.

```ts
import { createAnalytics } from "box-multi-tracker";
import { createZodValidator } from "box-multi-tracker/zod";
import { z } from "zod";

const validator = createZodValidator({
  user_registered: z.object({
    userId: z.string().min(1),
    email: z.string().trim().toLowerCase(), // transformation
  }),
  order_created: z.object({
    orderId: z.string(),
    total: z.coerce.number().positive(), // "500" becomes 500
  }),
  logout: z.undefined(),
});

const analytics = createAnalytics({
  providers: [{ provider: myProvider }], // AnalyticsProvider of the *output* types
  validator,
  onValidationError: ({ eventName, issues }) => reportInvalidEvent(eventName, issues),
});

analytics.track("user_registered", { userId: "u-1", email: "  Ada@Example.com " });
// providers receive { userId: "u-1", email: "ada@example.com" }

analytics.track("order_created", { orderId: "123", total: "500" });
// providers receive { orderId: "123", total: 500 }

analytics.track("order_created", { orderId: "123", total: "-1" });
// invalid: no provider is called; onValidationError receives
// { eventName: "order_created", issues: [{ message: "...", path: ["total"] }] }
```

### Types come from the schemas

Input and output types are inferred from the schemas (`z.input` and `z.output`), so `track` accepts what the schemas accept and providers see what they produce. You can also use the helper types:

```ts
import type { InferInputEvents, InferOutputEvents } from "box-multi-tracker/zod";

const schemas = { /* ... */ };
type AppEventInputs = InferInputEvents<typeof schemas>;
type AppEvents = InferOutputEvents<typeof schemas>;
```

If you already have hand-written `AppEvents` and `AppEventInputs` maps, annotate the validator so the compiler checks the schemas against them:

```ts
import type { EventValidator } from "box-multi-tracker";

const validator: EventValidator<AppEventInputs, AppEvents> = createZodValidator(schemas);
```

### How failures are converted

Zod's `safeParse` result is converted to the framework-independent `ValidationResult`. Each Zod issue becomes `{ message, path }`; no `ZodError` leaves the adapter.

- An event name with **no registered schema** is a validation failure (`No validation schema registered for event "..."`), not an exception.
- Only synchronous schemas are supported. A schema that throws when parsed (for example one with an async refinement) is reported as a failed validation (`Validator threw: ...`), and the event is not delivered.
- Schemas are not modified.

## The Sentry adapter

`box-multi-tracker/sentry` reports failures of the SDK itself to Sentry. It is a separate entry point (requires `@sentry/browser@^11`, installed by you); Core never imports Sentry and works without it.

It adds nothing to Core. It is a pair of handlers for the callbacks that already exist, `onError` and `onValidationError`:

```ts
import * as Sentry from "@sentry/browser";
import { createAnalytics } from "box-multi-tracker";
import { createSentryReporter } from "box-multi-tracker/sentry";

// Your application initializes Sentry. The adapter never does.
Sentry.init({ dsn: "...", defaultIntegrations: false /* see "Privacy" below */ });

const sentry = createSentryReporter({ instanceId: "checkout" });

const analytics = createAnalytics<AppEvents>({
  providers: [...],
  onError: sentry.onProviderError,
  onValidationError: sentry.onValidationError,
});
```

`instanceId` is any string that tells your analytics instances apart. If you also need your own handling, call the reporter from your callbacks: `onError: (error) => { log(error); sentry.onProviderError(error); }`.

### What is reported

| Situation | Reported? | Tags |
| --- | --- | --- |
| A provider throws (synchronously) or its promise rejects | Yes, as the original `Error` | `source`, `instance`, `error_type=provider_error`, `provider`, `event` |
| A validator throws | Yes, as the thrown `Error` | `source`, `instance`, `error_type=validator_exception`, `event` |
| A payload fails validation (an ordinary invalid payload) | **No** | none |
| Sentry itself throws or rejects | No, swallowed and never reported again | none |

`source` is always `box-multi-tracker`. Events are sent with `captureException`, level `error`, and a `box_multi_tracker` context holding `thrown_value_was_error` (whether the original value was an `Error`) and, for validator exceptions, `issue_count`.

A validator exception is recognized by the **presence** of the `cause` property on `ValidationError`, not by its value (a validator can throw `undefined`). Ordinary validation failures have no `cause` property.

### Privacy

- The adapter only receives `ProviderError` and `ValidationError`. Neither carries the tracked payload, and the adapter never sees the event object, so it cannot send them.
- Thrown values that are not `Error` instances are **not** sent; a fixed message is sent instead, because a thrown string or object may contain payload data.
- Validation issue messages are not sent, only their number.
- Messages of thrown `Error`s are sent as they are. They are written by your provider or validator, so do not put payload data in them.

### Limitations

- **Sentry's default integrations can leak payloads.** By default `@sentry/browser` attaches console output, clicks and fetch calls to events as breadcrumbs. If any provider logs payloads (for example a console provider), they end up in Sentry events. This is configured where you call `Sentry.init`, not in the adapter: disable the integrations you do not want (`defaultIntegrations: false`, or `maxBreadcrumbs: 0`, or filter in `beforeBreadcrumb`).
- The adapter does not initialize, flush, retry, queue or batch. Delivery is up to Sentry.
- Importing `box-multi-tracker/sentry` without `@sentry/browser` installed fails when the module loads. Core and the Zod adapter are unaffected.
- The adapter is tested against `@sentry/browser` 11.13; other 11.x versions are expected to work but are not verified.

## API reference

```ts
// With a validator: both event maps are inferred from it.
function createAnalytics<T extends EventMap<T>, TInput extends EventMap<TInput>>(
  config: AnalyticsConfig<T, TInput> & { validator: EventValidator<TInput, T> },
): AnalyticsInstance<T, TInput>;
// Without one:
function createAnalytics<T extends EventMap<T> = DefaultEvents>(
  config: AnalyticsConfig<T>,
): AnalyticsInstance<T>;

// T: what providers receive. TInput: what `track` accepts (defaults to T).
interface AnalyticsInstance<T, TInput = T> {
  track<K extends keyof T & keyof TInput & string>(name: K, ...args: TrackArgs<TInput, K>): void;
  enableProvider(name: string): void;
  disableProvider(name: string): void;
  isProviderEnabled(name: string): boolean;
}

interface AnalyticsConfig<T, TInput = T> {
  providers: ReadonlyArray<ProviderEntry<T>>;
  onError?: (error: ProviderError) => void;
  validator?: EventValidator<TInput, T>;
  onValidationError?: (error: ValidationError) => void;
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

interface EventValidator<TInput, T = TInput> {
  readonly validate: <K extends keyof TInput & keyof T & string>(name: K, payload: TInput[K]) => ValidationResult<T[K]>;
}

type ValidationResult<T> =
  | { readonly success: true; readonly data: T }
  | { readonly success: false; readonly issues: ReadonlyArray<ValidationIssue> };

interface ValidationIssue {
  readonly message: string;
  readonly path: ReadonlyArray<string | number>;
}

interface ValidationError {
  eventName: string;
  issues: ReadonlyArray<ValidationIssue>;
  cause?: unknown;
}
```

Exported values: `createAnalytics`.

Exported types: `AnalyticsInstance`, `AnalyticsConfig`, `ProviderEntry`, `AnalyticsProvider`, `AnalyticsEvent`, `ProviderError`, `EventMap`, `EventValidator`, `ValidationResult`, `ValidationIssue`, `ValidationError`.

**`box-multi-tracker/zod`** (optional; requires `zod@^4`):

```ts
function createZodValidator<S extends ZodEventSchemas<S>>(
  schemas: S,
): EventValidator<InferInputEvents<S>, InferOutputEvents<S>>;
```

Exported value: `createZodValidator`. Exported types: `ZodEventSchemas`, `InferInputEvents`, `InferOutputEvents`.

**`box-multi-tracker/sentry`** (optional; requires `@sentry/browser@^11`):

```ts
function createSentryReporter(options: SentryReporterOptions): SentryReporter;

interface SentryReporterOptions {
  instanceId: string;
}

interface SentryReporter {
  onProviderError(error: ProviderError): void;
  onValidationError(error: ValidationError): void;
}
```

Exported value: `createSentryReporter`. Exported types: `SentryReporter`, `SentryReporterOptions`.

## Out of scope

This library intentionally does only what is described above. It has no `identify`, `reset`, `init`, `flush` or `shutdown` APIs, and no buffering, retries, batching, persistence or per-provider event filtering or routing. Validation (see [Runtime validation](#runtime-validation)) is optional and applies to an event as a whole: it can reject an event for every provider or transform it for every provider, never for just some. Vendor integrations are written by the consuming application; the only one included is the optional [Sentry adapter](#the-sentry-adapter), which reports SDK failures and nothing else.

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
