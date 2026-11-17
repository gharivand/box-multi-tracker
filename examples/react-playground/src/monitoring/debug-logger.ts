import { createDebugLogger } from "box-multi-tracker/debug";
import type { DebugLogger } from "box-multi-tracker/debug";

/**
 * The application's debug logger: development builds only. In a production build
 * `import.meta.env.DEV` is `false`, so it is created disabled and writes nothing.
 * A parameter makes both cases testable.
 */
export function createAppDebugLogger(enabled: boolean = import.meta.env.DEV): DebugLogger {
  return createDebugLogger({ enabled, level: "debug" });
}
