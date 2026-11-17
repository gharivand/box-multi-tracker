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
  EventValidator,
  ProviderEntry,
  ProviderError,
  ValidationError,
  ValidationIssue,
  ValidationResult,
} from "box-multi-tracker";
import { createZodValidator } from "box-multi-tracker/zod";
import type { InferInputEvents, InferOutputEvents, ZodEventSchemas } from "box-multi-tracker/zod";
import { z } from "zod";

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

// --- Validation: the Core contract ----------------------------------------------

interface Inputs {
  order_completed: { orderId: string; totalPrice: number | string };
  user_signed_out: undefined;
}
interface Outputs {
  order_completed: { orderId: string; totalPrice: number };
  user_signed_out: undefined;
}

// A hand-written validator needs no validation library.
export const handWritten: EventValidator<Inputs, Outputs> = {
  validate(name, payload) {
    if (name === "user_signed_out") return { success: true, data: undefined } as ValidationResult<Outputs[typeof name]>;
    void payload;
    return { success: false, issues: [{ message: "rejected", path: [] }] };
  },
};

declare const outputsProvider: AnalyticsProvider<Outputs>;

// Both event maps are inferred from the validator.
export const validated = createAnalytics({
  providers: [{ provider: outputsProvider }],
  validator: handWritten,
  onValidationError: (error: ValidationError) => {
    const issues: ReadonlyArray<ValidationIssue> = error.issues;
    void issues;
    void error.eventName;
    void error.cause;
  },
});
export const validatedType: AnalyticsInstance<Outputs, Inputs> = validated;

// `track` takes the validator's input types.
validated.track("order_completed", { orderId: "o-1", totalPrice: "500" });
validated.track("order_completed", { orderId: "o-1", totalPrice: 500 });
validated.track("user_signed_out");
// @ts-expect-error input type does not allow a boolean
validated.track("order_completed", { orderId: "o-1", totalPrice: true });
// @ts-expect-error unknown event name
validated.track("order_refunded", { orderId: "o-1" });

// Providers receive the output types.
export const outputProvider: AnalyticsProvider<Outputs> = {
  name: "outputs",
  track(event) {
    if (event.name === "order_completed") {
      const total: number = event.payload.totalPrice;
      void total;
    }
  },
};

// Two type arguments require a validator.
// @ts-expect-error a validator is required when input and output maps are both given
createAnalytics<Outputs, Inputs>({ providers: [{ provider: outputsProvider }] });

// A validator must cover every event of the configured maps.
declare const partialValidator: EventValidator<Pick<Inputs, "order_completed">, Pick<Outputs, "order_completed">>;
createAnalytics<Outputs, Inputs>({
  providers: [{ provider: outputsProvider }],
  // @ts-expect-error validator does not cover `user_signed_out`
  validator: partialValidator,
});

// Without a validator, the single-argument form is unchanged.
export const unvalidated: AnalyticsInstance<Outputs> = createAnalytics<Outputs>({ providers: [{ provider: outputsProvider }] });

// --- Validation: the Zod adapter (`box-multi-tracker/zod`) ------------------------

const schemas = {
  order_completed: z.object({
    orderId: z.string(),
    totalPrice: z.union([z.number(), z.string().transform(Number)]),
  }),
  user_signed_out: z.undefined(),
};

export const zodValidator = createZodValidator(schemas);
export const zodValidatorType: EventValidator<InferInputEvents<typeof schemas>, InferOutputEvents<typeof schemas>> = zodValidator;
export const zodMatchesContract: EventValidator<Inputs, Outputs> = zodValidator;
export type SchemaMap = ZodEventSchemas<typeof schemas>;

export const withZod = createAnalytics({ providers: [{ provider: outputsProvider }], validator: zodValidator });
withZod.track("order_completed", { orderId: "o-1", totalPrice: "500" });
// @ts-expect-error input type does not allow a boolean
withZod.track("order_completed", { orderId: "o-1", totalPrice: false });

// @ts-expect-error a non-object payload schema is rejected
createZodValidator({ page_viewed: z.string() });

// The adapter is an entry point of its own; its internals are not reachable.
// @ts-expect-error internal modules are not reachable (exports map)
import type * as InternalZod from "box-multi-tracker/dist/zod/validator.js";
