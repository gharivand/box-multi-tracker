import { describe, expectTypeOf, test } from "vitest";
import { z } from "zod";
import { createAnalytics } from "../src/index.js";
import type { AnalyticsInstance, AnalyticsProvider, EventValidator } from "../src/index.js";
import { createZodValidator } from "../src/zod/index.js";
import type { InferInputEvents, InferOutputEvents, ZodEventSchemas } from "../src/zod/index.js";

// The schemas: `total` is text on the way in and a number on the way out.
const schemas = {
  user_registered: z.object({ userId: z.string() }),
  order_completed: z.object({ orderId: z.string(), total: z.string().transform((value) => Number(value)) }),
  search: z.object({ query: z.string() }).optional(), // optional payload
  logout: z.undefined(), // payloadless
};

type In = InferInputEvents<typeof schemas>;
type Out = InferOutputEvents<typeof schemas>;

describe("inference from schemas", () => {
  test("input events are the schemas' input types", () => {
    expectTypeOf<In>().toEqualTypeOf<{
      user_registered: { userId: string };
      order_completed: { orderId: string; total: string };
      search: { query: string } | undefined;
      logout: undefined;
    }>();
  });

  test("output events are the schemas' output types (after transformations)", () => {
    expectTypeOf<Out>().toEqualTypeOf<{
      user_registered: { userId: string };
      order_completed: { orderId: string; total: number };
      search: { query: string } | undefined;
      logout: undefined;
    }>();
  });

  test("the validator is an EventValidator over exactly those maps", () => {
    expectTypeOf(createZodValidator(schemas)).toEqualTypeOf<EventValidator<In, Out>>();
  });

  test("defaults and optional properties differ between input and output", () => {
    const defaults = { signup: z.object({ plan: z.string().default("free"), note: z.string().optional() }) };

    expectTypeOf<InferInputEvents<typeof defaults>["signup"]>().toEqualTypeOf<{ plan?: string | undefined; note?: string | undefined }>();
    expectTypeOf<InferOutputEvents<typeof defaults>["signup"]>().toEqualTypeOf<{ plan: string; note?: string | undefined }>();
  });
});

describe("event names and schemas correspond", () => {
  const validator = createZodValidator(schemas);

  test("validate accepts only event names that have a schema, with that schema's input", () => {
    validator.validate("order_completed", { orderId: "1", total: "500" });
    validator.validate("logout", undefined);
    // @ts-expect-error no schema for this event name
    validator.validate("not_an_event", {});
    // @ts-expect-error `total` is text before the transformation
    validator.validate("order_completed", { orderId: "1", total: 500 });
    // @ts-expect-error missing required property
    validator.validate("user_registered", {});
  });

  test("validate returns the output type of that event's schema", () => {
    const result = validator.validate("order_completed", { orderId: "1", total: "5" });
    if (result.success) {
      expectTypeOf(result.data).toEqualTypeOf<{ orderId: string; total: number }>();
    }
  });

  test("schemas whose payload is not an object or undefined are rejected", () => {
    // @ts-expect-error a string is not a valid payload type
    createZodValidator({ bad: z.string() });
    // @ts-expect-error a number is not a valid payload type
    createZodValidator({ bad: z.number() });
    // @ts-expect-error input must also be an object or undefined
    createZodValidator({ bad: z.string().pipe(z.object({ a: z.string() })) });
  });

  test("ZodEventSchemas describes a record of schemas", () => {
    expectTypeOf(schemas).toExtend<ZodEventSchemas<typeof schemas>>();
  });
});

declare const provider: AnalyticsProvider<Out>;

describe("with createAnalytics", () => {
  const validator = createZodValidator(schemas);

  test("both maps are inferred; track takes inputs, providers get outputs", () => {
    const analytics = createAnalytics({ providers: [{ provider }], validator });

    expectTypeOf(analytics).toEqualTypeOf<AnalyticsInstance<Out, In>>();
    analytics.track("order_completed", { orderId: "1", total: "500" });
    analytics.track("search");
    analytics.track("logout");
    // @ts-expect-error unknown event name
    analytics.track("not_an_event");
    // @ts-expect-error input form expects text
    analytics.track("order_completed", { orderId: "1", total: 500 });
    // @ts-expect-error required payload missing
    analytics.track("user_registered");
    // @ts-expect-error a payloadless event rejects a payload
    analytics.track("logout", {});
  });

  test("a provider sees the transformed type", () => {
    const typed: AnalyticsProvider<Out> = {
      name: "typed",
      track(event) {
        if (event.name === "order_completed") {
          expectTypeOf(event.payload.total).toEqualTypeOf<number>();
        }
      },
    };
    createAnalytics({ providers: [{ provider: typed }], validator });
  });

  test("explicit maps derived from the schemas work too", () => {
    const analytics = createAnalytics<Out, In>({ providers: [{ provider }], validator });

    expectTypeOf(analytics).toEqualTypeOf<AnalyticsInstance<Out, In>>();
  });

  test("a validator for fewer events than the configured maps is rejected", () => {
    const partial = createZodValidator({ logout: z.undefined() });

    createAnalytics<Out, In>({
      providers: [{ provider }],
      // @ts-expect-error the validator covers only `logout`
      validator: partial,
    });
  });
});

describe("public exports of the zod entry point", () => {
  test("createZodValidator is a function and the helper types are exported", () => {
    expectTypeOf(createZodValidator).toBeFunction();
    expectTypeOf<InferInputEvents<{ a: z.ZodUndefined }>>().toEqualTypeOf<{ a: undefined }>();
    expectTypeOf<InferOutputEvents<{ a: z.ZodUndefined }>>().toEqualTypeOf<{ a: undefined }>();
  });
});
