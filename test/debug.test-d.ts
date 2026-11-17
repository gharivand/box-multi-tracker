import { describe, expectTypeOf, test } from "vitest";
import { createAnalytics } from "../src/index.js";
import type { AnalyticsConfig, ProviderError, ValidationError } from "../src/index.js";
import * as debugEntry from "../src/debug/index.js";
import { createDebugLogger } from "../src/debug/index.js";
import type { DebugLogger, DebugLoggerOptions, DebugLogLevel } from "../src/debug/index.js";
import * as coreEntry from "../src/index.js";
import type { AppEvents } from "./helpers.js";

describe("createDebugLogger", () => {
  test("takes optional options and returns the two handlers", () => {
    expectTypeOf(createDebugLogger).parameter(0).toEqualTypeOf<DebugLoggerOptions | undefined>();
    expectTypeOf(createDebugLogger).returns.toEqualTypeOf<DebugLogger>();
    createDebugLogger();
    createDebugLogger({});
    createDebugLogger({ enabled: true, level: "warn" });
  });

  test("options: enabled is a boolean and level is one of three values, nothing else", () => {
    expectTypeOf<DebugLoggerOptions>().toEqualTypeOf<{ enabled?: boolean; level?: DebugLogLevel }>();
    expectTypeOf<DebugLogLevel>().toEqualTypeOf<"error" | "warn" | "debug">();
    // @ts-expect-error enabled must be a boolean
    createDebugLogger({ enabled: "yes" });
    // @ts-expect-error unknown level
    createDebugLogger({ level: "verbose" });
    // @ts-expect-error no other options
    createDebugLogger({ prefix: "x" });
  });

  test("exposes exactly the two handlers, typed with the Core's error types", () => {
    expectTypeOf<keyof DebugLogger>().toEqualTypeOf<"onProviderError" | "onValidationError">();
    expectTypeOf<DebugLogger["onProviderError"]>().toEqualTypeOf<(error: ProviderError) => void>();
    expectTypeOf<DebugLogger["onValidationError"]>().toEqualTypeOf<(error: ValidationError) => void>();
  });

  test("handlers plug into the Core callbacks", () => {
    const logger = createDebugLogger({ enabled: true });
    const config: AnalyticsConfig<AppEvents> = {
      providers: [],
      onError: logger.onProviderError,
      onValidationError: logger.onValidationError,
    };
    createAnalytics<AppEvents>(config);
    // @ts-expect-error the handlers are not interchangeable
    const swapped: (error: ValidationError) => void = logger.onProviderError;
    void swapped;
  });
});

describe("entry points", () => {
  test("the debug entry exports only createDebugLogger as a value", () => {
    expectTypeOf<keyof typeof debugEntry>().toEqualTypeOf<"createDebugLogger">();
  });

  test("the Core entry does not export the logger", () => {
    expectTypeOf<keyof typeof coreEntry>().toEqualTypeOf<"createAnalytics">();
  });
});
