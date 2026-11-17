# react-playground: React + Vite consumer

A realistic frontend consumer of `box-multi-tracker`, built with Vite, React and TypeScript. It is a playground for the SDK and a permanent boundary test: it installs the SDK from a **packed tarball** (the artifact an npm consumer receives) and imports it only as `box-multi-tracker`. It never touches SDK source.

## What it demonstrates

- Two independent analytics instances with different provider order and initial state.
- Three providers: `console` (sync), `mock-analytics` (async), and `flaky-service` (fails on demand: sync throw or async rejection).
- Enable and disable per provider (the real `enableProvider` / `disableProvider` / `isProviderEnabled`), taking effect on the next `track` call.
- Provider failure isolation, reported through the configured `onError`.
- Unknown provider behavior (`enableProvider("does-not-exist")` throws, `isProviderEnabled` returns `false`).
- A live event log: event, payload, global order, each provider in invocation order with its outcome, skipped (disabled) providers, and dropped events.
- **Runtime validation with the Zod adapter** (`box-multi-tracker/zod`): every event is validated before any provider sees it. See [Validation](#validation).
- **Sentry reporting** (`box-multi-tracker/sentry`): provider errors and validator exceptions are reported, ordinary validation failures and payloads are not. See [Sentry](#sentry).

## Validation

The analytics layer configures a validator built from Zod schemas (`src/analytics/schemas.ts`), passed to `createAnalytics` together with `onValidationError`. The **Validation** card in the app runs four scenarios, and the event log shows what happened:

| Scenario | What you see in the log |
| --- | --- |
| Valid order, total sent as text (`"500"`) | **Tracked payload** has `totalPrice: "500"`; **Providers received** shows `totalPrice: 500`. Every provider got the transformed payload. |
| Valid product, messy input (padded name, price `"4.50"`) | Trimmed name and `price: 4.5` reach the providers. |
| Invalid order (empty `orderId`, `itemsCount: -1`) | A red *validation failed* block listing each issue with its path. **No provider is called**: the provider rows are absent and the provider counters do not move. |
| Invalid product price (`"abc"`) | Same: rejected, nothing delivered, even to enabled providers. |

Things to try:

- Run a valid scenario while `flaky-service` is set to *throws*: the failure is reported to `onError` (the *reported to onError* badge) and the other providers still receive the transformed payload.
- Run an invalid scenario in the same situation: nothing reaches any provider, so `onError` is not involved at all. Validation errors and provider errors use separate callbacks.
- Disable all providers of an instance and run an invalid scenario: it is still validated and reported.
- Use the other features (login, product details, complete order): they now go through the same validator, and their payloads are unchanged because they are already valid.

How it is wired:

- `events.ts` holds two maps: `AppEvents` (what providers receive) and `AppEventInputs` (what `track` accepts; prices may be text).
- `schemas.ts` defines one schema per event and annotates the result as `EventValidator<AppEventInputs, AppEvents>`, so the compiler checks the schemas against the hand-written maps.
- `analytics.ts` calls `createAnalytics<AppEvents, AppEventInputs>({ providers, validator, onError, onValidationError })`.
- `dispatch-log.ts` records the tracked payload, what each provider received, and any validation issues; `EventLog` renders them.
- `features/validation/validation-demo/` is the feature that triggers the scenarios, through the same `Tracking` abstraction as every other feature.

The example installs `zod` as its own dependency. The SDK does not install it.

## Sentry

The app calls `createSentryReporter({ instanceId })` for each instance and connects it to `onError` and `onValidationError` (next to the event log, which keeps its own copy of every error). `src/monitoring/sentry.ts` is the only file that imports `@sentry/browser`; the SDK adapter never initializes Sentry, so the app does.

**No real Sentry project is involved.** Sentry is initialized with a dummy DSN (`https://playground@sentry.invalid/1`) and an in-memory transport. Nothing leaves the browser, and events are not delivered anywhere. The **Sentry captures** card lists every event Sentry was asked to send, exactly as it would have been sent. Default integrations are disabled, because Sentry would otherwise attach console output (the console provider prints payloads) to events as breadcrumbs.

The **Sentry** card runs four scenarios on the selected instance:

| Scenario | Sentry captures |
| --- | --- |
| Provider error (`flaky-service` throws) | One event: `error_type=provider_error`, with `provider`, `event` and `instance` tags. The other providers still receive the event. |
| Validator exception (the validator crashes) | One event: `error_type=validator_exception`, no `provider` tag. No provider receives the event. |
| Ordinary validation failure (invalid order) | **Nothing.** The event log still shows the rejection. |
| Personal data in the payload (a sign-in with `ada.private@example.com`, `flaky-service` throws) | One provider error event. The card searches every captured event for the email: it is found in none. |

The two provider scenarios need `flaky-service` enabled on the selected instance; the card says so if it is not. A scenario puts `flaky-service` back to healthy, and disarms the crashing validator, when it is done. `src/analytics/validator-fault.ts` is the test double that makes the validator crash on demand.

How it is wired: `features/monitoring/sentry-demo/` triggers the scenarios through the same `Tracking` abstraction as every other feature; `components/SentryCaptures` shows the captures; `monitoring/sentry-capture-log.ts` is the framework-agnostic store behind them.

The example installs `@sentry/browser` as its own dependency. The SDK does not install it.

## Install and run

The repository's own dependencies must be installed first (`npm install` in the repository root).

```bash
cd examples/react-playground
npm run setup     # build SDK -> npm pack -> install tarball + app dependencies
npm run dev       # start Vite
npm test          # unit tests of the app's analytics layer (Vitest)
npm run verify    # typecheck app + public API (NodeNext & Bundler) + tests + production build
```

`setup` runs `scripts/setup.mjs`, which builds the SDK, runs `npm pack` into `.sdk/` (git-ignored), checks the tarball contains only `dist/`, `package.json` and `README.md`, and runs `npm install`. `package.json` points at it with `"box-multi-tracker": "file:.sdk/box-multi-tracker.tgz"`. Re-run `npm run setup` after changing the SDK.

## Structure

```text
src/
  app/                       composition: App, PlaygroundProvider, context, hooks
  analytics/                 the application's analytics layer
    events.ts                AppEvents (provider payloads) and AppEventInputs (track payloads)
    schemas.ts               Zod schemas per event -> createZodValidator (validation rules, owned by the app)
    analytics.ts             composition root: builds providers, calls createAnalytics<AppEvents, AppEventInputs>()
    tracking.ts              semantic tracking API used by features
    providers/               console, mock-analytics, flaky (test double)
    observed-provider.ts     decorator recording provider calls for the log (demo only)
    dispatch-log.ts          framework-agnostic store behind the event log (demo only)
    validator-fault.ts       makes the validator crash on demand (test double)
  monitoring/                Sentry setup (dummy DSN, in-memory transport) and the capture log
  domain/catalog.ts          fake storefront data
  features/<area>/<feature>/ index.tsx (UI), <feature>.hook.ts (logic), <feature>.types.ts, plain services
  components/                ProviderControls, EventLog, SentryCaptures
type-checks/                 public-API type checks, run under NodeNext and Bundler
```

## Conventions

- Components render and forward interactions; feature hooks own state and orchestration; business logic lives in plain TypeScript services.
- Features depend on the `Tracking` abstraction (narrowed per feature with `Pick`), never on the SDK or a provider.
- The event is tracked only at the semantic point where it is true: after a successful login, after the product has loaded, after the order was created. Failures track nothing.
- `type-checks/public-api.ts` is a self-contained consumer check (valid and invalid events and payloads, narrowing, the validator contract, `box-multi-tracker/zod`, `box-multi-tracker/sentry`, public type imports, inaccessible internals). It is separate from the app because NodeNext needs `.js` import extensions, which a Vite app does not use.
