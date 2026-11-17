import type { input, output, ZodType } from "zod";
import type { EventValidator, ValidationIssue, ValidationResult } from "../types.js";

/**
 * One Zod schema per event. The key is the event name; the schema describes
 * the payload (`z.undefined()` for payloadless events).
 *
 * Both what a schema accepts and what it produces must be an object or
 * `undefined`, the same constraint as the Core's event maps.
 */
export type ZodEventSchemas<S> = {
  [K in keyof S]: ZodType<object | undefined, object | undefined>;
};

/** Event map of the payloads `track` accepts: the schemas' input types. */
export type InferInputEvents<S extends ZodEventSchemas<S>> = { [K in keyof S]: input<S[K]> };

/** Event map of the payloads providers receive: the schemas' output types. */
export type InferOutputEvents<S extends ZodEventSchemas<S>> = { [K in keyof S]: output<S[K]> };

/**
 * Creates an `EventValidator` from one Zod schema per event.
 *
 * - Valid payloads are returned as parsed by Zod, so transformations
 *   (`.transform`, defaults, coercion) reach the providers.
 * - Invalid payloads become a framework-independent `ValidationResult`; no Zod
 *   types or errors leave this function.
 * - An event name without a schema (only possible from untyped code) fails
 *   validation instead of being dispatched unchecked.
 *
 * Zod runs synchronously here, so schemas with async refinements are not
 * supported: `safeParse` throws for them, and the Core reports that as a
 * validation failure.
 */
export function createZodValidator<S extends ZodEventSchemas<S>>(
  schemas: S,
): EventValidator<InferInputEvents<S>, InferOutputEvents<S>> {
  return {
    validate<K extends keyof S & string>(
      name: K,
      payload: InferInputEvents<S>[K],
    ): ValidationResult<InferOutputEvents<S>[K]> {
      if (!Object.hasOwn(schemas, name)) {
        return failure([{ message: `No validation schema registered for event "${name}"`, path: [] }]);
      }

      const result = schemas[name].safeParse(payload);
      if (result.success) {
        // `safeParse` is typed with the constraint's output (`object | undefined`);
        // by construction of `InferOutputEvents` it is exactly `output<S[K]>`.
        return { success: true, data: result.data as InferOutputEvents<S>[K] };
      }
      return failure(
        result.error.issues.map((issue) => ({
          message: issue.message,
          path: issue.path.map((segment) => (typeof segment === "symbol" ? String(segment) : segment)),
        })),
      );
    },
  };
}

function failure(issues: ReadonlyArray<ValidationIssue>): { success: false; issues: ReadonlyArray<ValidationIssue> } {
  return { success: false, issues };
}
