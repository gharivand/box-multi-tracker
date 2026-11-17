import { createContext, useContext } from "react";
import type { AppAnalytics } from "../../analytics/analytics";
import type { Tracking } from "../../analytics/tracking";
import type { Playground } from "./playground";

export interface PlaygroundContextValue extends Playground {
  /** Instance that feature actions currently send their events to. */
  readonly activeInstance: AppAnalytics;
  selectInstance(instanceId: string): void;
}

export const PlaygroundContext = createContext<PlaygroundContextValue | null>(null);

export function usePlayground(): PlaygroundContextValue {
  const value = useContext(PlaygroundContext);
  if (value === null) {
    throw new Error("usePlayground must be used inside <PlaygroundProvider>");
  }
  return value;
}

/**
 * The application's tracking API for the active instance. Features call this
 * and never see the SDK or any provider.
 */
export function useTracking(): Tracking {
  return usePlayground().activeInstance.tracking;
}
