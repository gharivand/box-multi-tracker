import { describe, expect, it } from "vitest";
import { z } from "zod";
import { createAnalytics } from "../src/index.js";
import type { AnalyticsProvider, ProviderError, ValidationError } from "../src/index.js";
import { createZodValidator } from "../src/zod/index.js";

// Schemas for the examples. `total` arrives as text and is transformed to a number.
const schemas = {
  user_registered: z.object({ userId: z.string().min(1) }),
  order_completed: z.object({
    orderId: z.string(),
    total: z.string().transform((value) => Number(value)),
  }),
  search: z.object({ query: z.string().trim() }).optional(),
  logout: z.undefined(),
};

const validator = createZodValidator(schemas);

describe("createZodValidator: results", () => {
  it("returns success with the parsed data for a valid payload", () => {
    expect(validator.validate("user_registered", { userId: "u1" })).toEqual({
      success: true,
      data: { userId: "u1" },
    });
  });

  it("returns the transformed value, not the input", () => {
    const result = validator.validate("order_completed", { orderId: "123", total: "500" });

    expect(result).toEqual({ success: true, data: { orderId: "123", total: 500 } });
  });

  it("applies trimming, defaults and other schema transformations", () => {
    const withDefaults = createZodValidator({
      signup: z.object({ plan: z.string().default("free"), email: z.string().trim().toLowerCase() }),
    });

    const result = withDefaults.validate("signup", { email: "  Ada@Example.COM " } as { email: string; plan?: string });

    expect(result).toEqual({ success: true, data: { plan: "free", email: "ada@example.com" } });
  });

  it("uses a different schema for each event name", () => {
    expect(validator.validate("user_registered", { userId: "" }).success).toBe(false);
    expect(validator.validate("order_completed", { orderId: "", total: "1" }).success).toBe(true);
    expect(validator.validate("search", { query: "  boxes " })).toEqual({ success: true, data: { query: "boxes" } });
  });

  it("supports optional payloads and payloadless events", () => {
    expect(validator.validate("search", undefined)).toEqual({ success: true, data: undefined });
    expect(validator.validate("logout", undefined)).toEqual({ success: true, data: undefined });
  });

  it("rejects a payload given to a payloadless event", () => {
    const result = validator.validate("logout", {} as unknown as undefined);

    expect(result.success).toBe(false);
  });
});

describe("createZodValidator: failures become framework-independent results", () => {
  it("returns plain issues with a message and a path", () => {
    const result = validator.validate("user_registered", { userId: "" });

    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.issues).toHaveLength(1);
    expect(result.issues[0]?.path).toEqual(["userId"]);
    expect(typeof result.issues[0]?.message).toBe("string");
    expect(result.issues[0]?.message.length).toBeGreaterThan(0);
  });

  it("exposes nothing Zod-specific: only `success` and `issues`, issues only `message` and `path`", () => {
    const result = validator.validate("order_completed", { orderId: 1, total: 2 } as unknown as { orderId: string; total: string });

    expect(result.success).toBe(false);
    if (result.success) return;
    expect(Object.keys(result).sort()).toEqual(["issues", "success"]);
    expect(result.issues.length).toBeGreaterThanOrEqual(2); // orderId and total
    for (const issue of result.issues) {
      expect(Object.keys(issue).sort()).toEqual(["message", "path"]);
      expect(issue).not.toBeInstanceOf(z.ZodError);
    }
    expect(result.issues.map((issue) => issue.path)).toEqual(expect.arrayContaining([["orderId"], ["total"]]));
  });

  it("keeps nested paths, including array indexes", () => {
    const nested = createZodValidator({
      checkout: z.object({ items: z.array(z.object({ qty: z.number().int().positive() })) }),
    });

    const result = nested.validate("checkout", { items: [{ qty: 1 }, { qty: -1 }] });

    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.issues[0]?.path).toEqual(["items", 1, "qty"]);
  });

  it("reports every issue, not only the first", () => {
    const result = validator.validate("order_completed", {} as { orderId: string; total: string });

    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.issues.map((issue) => issue.path[0]).sort()).toEqual(["orderId", "total"]);
  });

  it("converts symbol path segments to strings", () => {
    const key = Symbol("secret");
    const withSymbol = createZodValidator({
      odd: z.object({ [key]: z.string() }),
    });

    const result = withSymbol.validate("odd", { [key]: 1 } as unknown as { [key]: string });

    expect(result.success).toBe(false);
    if (result.success) return;
    for (const segment of result.issues[0]?.path ?? []) {
      expect(["string", "number"]).toContain(typeof segment);
    }
  });
});

describe("createZodValidator: unknown events", () => {
  const untyped = validator.validate as unknown as (name: string, payload: unknown) => ReturnType<typeof validator.validate>;

  it("fails validation for an event without a schema", () => {
    const result = untyped("not_registered", { anything: true });

    expect(result).toEqual({
      success: false,
      issues: [{ message: 'No validation schema registered for event "not_registered"', path: [] }],
    });
  });

  it("does not mistake inherited object properties for schemas", () => {
    for (const name of ["toString", "constructor", "hasOwnProperty", "__proto__"]) {
      const result = untyped(name, {});
      expect(result.success).toBe(false);
    }
  });

  it("does not mutate the schemas object it was given", () => {
    const input = { logout: z.undefined() };
    const copy = { ...input };

    createZodValidator(input);

    expect(input).toEqual(copy);
  });
});

describe("createZodValidator with createAnalytics", () => {
  function recorder(name: string) {
    const events: unknown[] = [];
    const provider: AnalyticsProvider<{ order_completed: { orderId: string; total: number } }> & { events: unknown[] } = {
      name,
      events,
      track(event) {
        events.push(event);
      },
    };
    return provider;
  }

  const orderSchemas = {
    order_completed: z.object({ orderId: z.string(), total: z.string().transform((value) => Number(value)) }),
  };

  it("hands providers the transformed payload (the specified example)", () => {
    const a = recorder("a");
    const b = recorder("b");
    const analytics = createAnalytics({
      providers: [{ provider: a }, { provider: b }],
      validator: createZodValidator(orderSchemas),
    });

    analytics.track("order_completed", { orderId: "123", total: "500" });

    expect(a.events).toEqual([{ name: "order_completed", payload: { orderId: "123", total: 500 } }]);
    expect(b.events[0]).toBe(a.events[0]);
  });

  it("dispatches nothing and reports a ValidationError for an invalid payload", () => {
    const provider = recorder("p");
    const validationErrors: ValidationError[] = [];
    const providerErrors: ProviderError[] = [];
    const analytics = createAnalytics({
      providers: [{ provider }],
      validator: createZodValidator(orderSchemas),
      onValidationError: (error) => validationErrors.push(error),
      onError: (error) => providerErrors.push(error),
    });

    analytics.track("order_completed", { orderId: 7 as unknown as string, total: "500" });

    expect(provider.events).toEqual([]);
    expect(providerErrors).toEqual([]);
    expect(validationErrors).toHaveLength(1);
    expect(validationErrors[0]?.eventName).toBe("order_completed");
    expect(validationErrors[0]?.issues[0]?.path).toEqual(["orderId"]);
    expect(validationErrors[0]).not.toHaveProperty("cause");
  });

  it("reports a schema that cannot run synchronously as a validator failure, not a crash", () => {
    const provider = recorder("p");
    const validationErrors: ValidationError[] = [];
    const analytics = createAnalytics({
      providers: [{ provider }],
      validator: createZodValidator({
        order_completed: z.object({ orderId: z.string(), total: z.number() }).refine(async () => true),
      }),
      onValidationError: (error) => validationErrors.push(error),
    });

    expect(() => analytics.track("order_completed", { orderId: "1", total: 1 })).not.toThrow();

    expect(provider.events).toEqual([]);
    expect(validationErrors).toHaveLength(1);
    expect(validationErrors[0]?.issues[0]?.message).toMatch(/^Validator threw: /);
    expect(validationErrors[0]?.cause).toBeInstanceOf(Error);
  });

  it("lets two instances use different schemas for the same event", () => {
    const strictProvider = recorder("p");
    const looseProvider = recorder("p");
    const strict = createAnalytics({
      providers: [{ provider: strictProvider }],
      validator: createZodValidator({
        order_completed: z.object({ orderId: z.string().min(5), total: z.string().transform(Number) }),
      }),
    });
    const loose = createAnalytics({
      providers: [{ provider: looseProvider }],
      validator: createZodValidator(orderSchemas),
    });

    strict.track("order_completed", { orderId: "1", total: "10" });
    loose.track("order_completed", { orderId: "1", total: "10" });

    expect(strictProvider.events).toEqual([]);
    expect(looseProvider.events).toHaveLength(1);
  });
});
