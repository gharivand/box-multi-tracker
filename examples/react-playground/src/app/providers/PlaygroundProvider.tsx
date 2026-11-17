import { useMemo, useState } from "react";
import type { ReactNode } from "react";
import { createPlayground } from "./playground";
import { PlaygroundContext } from "./playground.context";
import type { PlaygroundContextValue } from "./playground.context";
import type { SentryCaptureLog } from "../../monitoring/sentry-capture-log";

export function PlaygroundProvider({ children, sentryLog }: { children: ReactNode; sentryLog: SentryCaptureLog }) {
  // Created once per mount. The SDK instances hold their own state in closures.
  const [playground] = useState(() => createPlayground(sentryLog));
  const [activeId, setActiveId] = useState(() => playground.instances[0]?.instanceId);

  const value = useMemo<PlaygroundContextValue>(() => {
    const activeInstance = playground.instances.find((instance) => instance.instanceId === activeId);
    if (activeInstance === undefined) {
      throw new Error(`Unknown instance: ${String(activeId)}`);
    }
    return { ...playground, activeInstance, selectInstance: setActiveId };
  }, [playground, activeId]);

  return <PlaygroundContext.Provider value={value}>{children}</PlaygroundContext.Provider>;
}
