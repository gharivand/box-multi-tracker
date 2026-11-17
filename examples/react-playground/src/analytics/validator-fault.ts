import type { EventValidator } from "box-multi-tracker";
import type { AppEventInputs, AppEvents } from "./events";

/** Mutable switch the playground uses to make the validator crash on demand. */
export interface ValidatorFault {
  isArmed(): boolean;
  arm(): void;
  disarm(): void;
}

export function createValidatorFault(): ValidatorFault {
  let armed = false;
  return {
    isArmed: () => armed,
    arm: () => {
      armed = true;
    },
    disarm: () => {
      armed = false;
    },
  };
}

/**
 * Wraps a validator so it throws while the fault is armed (a test double, like
 * the flaky provider). A well-behaved validator reports invalid payloads as
 * results and never throws; this exists to show what the SDK and monitoring do
 * when one does.
 */
export function withValidatorFault(
  validator: EventValidator<AppEventInputs, AppEvents>,
  fault: ValidatorFault,
): EventValidator<AppEventInputs, AppEvents> {
  return {
    validate(name, payload) {
      if (fault.isArmed()) {
        throw new Error(`Simulated validator crash while validating "${name}"`);
      }
      return validator.validate(name, payload);
    },
  };
}
