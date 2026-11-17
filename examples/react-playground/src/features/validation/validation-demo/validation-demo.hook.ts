import { useState } from "react";
import { useTracking } from "../../../app/providers/playground.context";
import { SCENARIOS } from "./validation-demo.scenarios";
import type { ValidationScenario, ValidationTracking } from "./validation-demo.types";

export function useValidationDemo() {
  const tracking: ValidationTracking = useTracking();
  const [lastRunId, setLastRunId] = useState<string | null>(null);

  function run(scenario: ValidationScenario): void {
    scenario.send(tracking);
    setLastRunId(scenario.id);
  }

  return { scenarios: SCENARIOS, lastRunId, run };
}
