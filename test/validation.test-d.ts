import { describe, expectTypeOf, test } from "vitest";
import { createAnalytics } from "../src/index.js";
import type {
  AnalyticsConfig,
  AnalyticsInstance,
  AnalyticsProvider,
  EventValidator,
  ValidationError,
  ValidationIssue,
  ValidationResult,
} from "../src/index.js";

// Fixtures. `Inputs` is what callers pass to `track`; `Outputs` is what the
// validator produces and providers receive. `amount` differs between the two.
interface Inputs {
  user_registered: { userId: string };
  order_created: { orderId: string; amount: string | number };
  search: { query: string } | undefined; // optional payload
  logout: undefined; // payloadless
}

interface Outputs {
  user_registered: { userId: string };
  order_created: { orderId: string; amount: number };
  search: { query: string } | undefined;
  logout: undefined;
}

// Same keys as Outputs, but the wrong output type for `order_created`.
interface WrongOutputs {
  user_registered: { userId: string };
  order_created: { orderId: string; amount: string };
  search: { query: string } | undefined;
  logout: undefined;
}

// Covers only some events.
interface PartialEvents {
  logout: undefined;
}

declare const validator: EventValidator<Inputs, Outputs>;
declare const identityValidator: EventValidator<Outputs>;
declare const wrongOutputValidator: EventValidator<Inputs, WrongOutputs>;
declare const partialValidator: EventValidator<PartialEvents>;
declare const outputsProvider: AnalyticsProvider<Outputs>;
declare const analytics: AnalyticsInstance<Outputs, Inputs>;

describe("createAnalytics with a validator: instance types", () => {
  test("explicit input and output maps", () => {
    const analytics = createAnalytics<Outputs, Inputs>({ providers: [{ provider: outputsProvider }], validator });

    expectTypeOf(analytics).toEqualTypeOf<AnalyticsInstance<Outputs, Inputs>>();
  });

  test("both maps are inferred from the validator", () => {
    const analytics = createAnalytics({ providers: [{ provider: outputsProvider }], validator });

    expectTypeOf(analytics).toEqualTypeOf<AnalyticsInstance<Outputs, Inputs>>();
  });

  test("a validator accepting wider input than it produces keeps its input type (no collapse to outputs)", () => {
    // `Inputs.order_created.amount` is `string | number`, a superset of the output `number`:
    // the validator is also assignable to `EventValidator<Outputs>`, which must not win.
    const analytics = createAnalytics({ providers: [{ provider: outputsProvider }], validator });

    expectTypeOf(analytics.track<"order_created">).parameter(1).toEqualTypeOf<{
      orderId: string;
      amount: string | number;
    }>();
  });

  test("a validator that keeps the types is inferred as identical maps", () => {
    const analytics = createAnalytics({ providers: [{ provider: outputsProvider }], validator: identityValidator });

    expectTypeOf(analytics).toEqualTypeOf<AnalyticsInstance<Outputs, Outputs>>();
  });

  test("a validator that keeps the types is accepted with a single type argument", () => {
    const analytics = createAnalytics<Outputs>({ providers: [{ provider: outputsProvider }], validator: identityValidator });

    expectTypeOf(analytics).toEqualTypeOf<AnalyticsInstance<Outputs>>();
  });

  test("without a validator the single-argument form is unchanged", () => {
    const analytics = createAnalytics<Outputs>({ providers: [{ provider: outputsProvider }] });

    expectTypeOf(analytics).toEqualTypeOf<AnalyticsInstance<Outputs>>();
    expectTypeOf<AnalyticsInstance<Outputs>>().toEqualTypeOf<AnalyticsInstance<Outputs, Outputs>>();
  });

  test("two type arguments require a validator", () => {
    // @ts-expect-error input and output maps can differ only when a validator maps one to the other
    createAnalytics<Outputs, Inputs>({ providers: [{ provider: outputsProvider }] });
  });
});

describe("track accepts the input payload types", () => {
  test("valid names and payloads, including the pre-transformation form", () => {
    analytics.track("user_registered", { userId: "u1" });
    analytics.track("order_created", { orderId: "1", amount: 5 });
    analytics.track("order_created", { orderId: "1", amount: "500" }); // input form, before the transform
    analytics.track("search");
    analytics.track("search", { query: "boxes" });
    analytics.track("logout");
  });

  test("invalid names and payloads are rejected", () => {
    // @ts-expect-error unknown event name
    analytics.track("not_an_event");
    // @ts-expect-error required payload missing
    analytics.track("user_registered");
    // @ts-expect-error wrong input type (neither string nor number)
    analytics.track("order_created", { orderId: "1", amount: true });
    // @ts-expect-error missing required property
    analytics.track("order_created", { orderId: "1" });
    // @ts-expect-error unknown property
    analytics.track("user_registered", { userId: "u1", extra: 1 });
    // @ts-expect-error a payloadless event rejects a payload
    analytics.track("logout", {});
    // @ts-expect-error wrong type for an optional payload
    analytics.track("search", { query: 1 });
  });

  test("the parameter type is the input type, not the output type", () => {
    expectTypeOf(analytics.track<"order_created">).parameter(1).toEqualTypeOf<{
      orderId: string;
      amount: string | number;
    }>();
  });
});

describe("providers receive the output payload types", () => {
  test("narrowing in a provider yields the transformed type", () => {
    const provider: AnalyticsProvider<Outputs> = {
      name: "narrowing",
      track(event) {
        switch (event.name) {
          case "order_created":
            expectTypeOf(event.payload.amount).toEqualTypeOf<number>();
            break;
          case "user_registered":
            expectTypeOf(event.payload.userId).toEqualTypeOf<string>();
            break;
          default:
            break;
        }
      },
    };
    createAnalytics({ providers: [{ provider }], validator });
  });
});

describe("the validator must match the configured maps", () => {
  test("a validator that does not cover every event is rejected", () => {
    createAnalytics<Outputs, Inputs>({
      providers: [{ provider: outputsProvider }],
      // @ts-expect-error covers only `logout`, not the whole event map
      validator: partialValidator,
    });
  });

  test("a validator with the wrong output types is rejected", () => {
    createAnalytics<Outputs, Inputs>({
      providers: [{ provider: outputsProvider }],
      // @ts-expect-error produces `amount: string`, but providers expect `amount: number`
      validator: wrongOutputValidator,
    });
  });

  test("validate is typed per event name", () => {
    expectTypeOf(validator.validate<"order_created">).returns.toEqualTypeOf<ValidationResult<Outputs["order_created"]>>();
    validator.validate("order_created", { orderId: "1", amount: "5" });
    // @ts-expect-error unknown event name
    validator.validate("not_an_event", {});
    // @ts-expect-error wrong payload for the event
    validator.validate("order_created", { orderId: "1", amount: true });
  });
});

describe("validation result and error types", () => {
  test("ValidationResult narrows on `success`", () => {
    const result = {} as ValidationResult<{ value: number }>;
    if (result.success) {
      expectTypeOf(result.data).toEqualTypeOf<{ value: number }>();
    } else {
      expectTypeOf(result.issues).toEqualTypeOf<ReadonlyArray<ValidationIssue>>();
    }
  });

  test("issues are plain data", () => {
    expectTypeOf<ValidationIssue>().toEqualTypeOf<{
      readonly message: string;
      readonly path: ReadonlyArray<string | number>;
    }>();
  });

  test("onValidationError receives a ValidationError without a payload", () => {
    expectTypeOf<NonNullable<AnalyticsConfig<Outputs, Inputs>["onValidationError"]>>().parameter(0).toEqualTypeOf<ValidationError>();
    expectTypeOf<ValidationError>().toHaveProperty("eventName").toEqualTypeOf<string>();
    expectTypeOf<ValidationError>().toHaveProperty("issues");
    expectTypeOf<ValidationError>().not.toHaveProperty("payload");
  });

  test("the config types are compatible when no validator is used", () => {
    expectTypeOf<AnalyticsConfig<Outputs>>().toEqualTypeOf<AnalyticsConfig<Outputs, Outputs>>();
  });
});
