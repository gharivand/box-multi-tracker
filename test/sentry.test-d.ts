import { describe, expectTypeOf, test } from "vitest";
import { createAnalytics } from "../src/index.js";
import type { AnalyticsConfig, ProviderError, ValidationError } from "../src/index.js";
import { createSentryReporter } from "../src/sentry/index.js";
import type { SentryReporter, SentryReporterOptions } from "../src/sentry/index.js";
import type { AppEvents } from "./helpers.js";

describe("createSentryReporter", () => {
  test("takes an instance id and returns the two handlers", () => {
    expectTypeOf(createSentryReporter).parameter(0).toEqualTypeOf<SentryReporterOptions>();
    expectTypeOf(createSentryReporter).returns.toEqualTypeOf<SentryReporter>();
    expectTypeOf<SentryReporterOptions>().toEqualTypeOf<{ instanceId: string }>();
  });

  test("an instance id is required and must be a string", () => {
    // @ts-expect-error the options object is required
    createSentryReporter();
    // @ts-expect-error instanceId is required
    createSentryReporter({});
    // @ts-expect-error instanceId must be a string
    createSentryReporter({ instanceId: 1 });
    // @ts-expect-error there are no other options (no init, flush or queue settings)
    createSentryReporter({ instanceId: "a", dsn: "https://example.invalid/1" });
  });

  test("exposes exactly the two handlers, typed with the Core's error types", () => {
    expectTypeOf<keyof SentryReporter>().toEqualTypeOf<"onProviderError" | "onValidationError">();
    expectTypeOf<SentryReporter["onProviderError"]>().toEqualTypeOf<(error: ProviderError) => void>();
    expectTypeOf<SentryReporter["onValidationError"]>().toEqualTypeOf<(error: ValidationError) => void>();
  });

  test("the handlers plug straight into createAnalytics", () => {
    const monitoring = createSentryReporter({ instanceId: "instance-a" });

    const config: AnalyticsConfig<AppEvents> = {
      providers: [],
      onError: monitoring.onProviderError,
      onValidationError: monitoring.onValidationError,
    };
    const analytics = createAnalytics<AppEvents>(config);

    expectTypeOf(analytics.track).toBeFunction();
  });

  test("the handlers cannot be swapped", () => {
    const monitoring = createSentryReporter({ instanceId: "instance-a" });

    createAnalytics<AppEvents>({
      providers: [],
      // @ts-expect-error a validation handler is not a provider error handler
      onError: monitoring.onValidationError,
    });
    createAnalytics<AppEvents>({
      providers: [],
      // @ts-expect-error a provider error handler is not a validation handler
      onValidationError: monitoring.onProviderError,
    });
  });
});

describe("public exports", () => {
  test("the Core entry point does not export the Sentry adapter", () => {
    expectTypeOf<typeof import("../src/index.js")>().not.toHaveProperty("createSentryReporter");
  });

  test("the adapter entry point exports only the reporter factory and its types", () => {
    expectTypeOf<keyof typeof import("../src/sentry/index.js")>().toEqualTypeOf<"createSentryReporter">();
  });
});
