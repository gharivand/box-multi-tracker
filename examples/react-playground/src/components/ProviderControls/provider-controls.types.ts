import type { AppAnalytics } from "../../analytics/analytics";

export interface ProviderControlsProps {
  instance: AppAnalytics;
  /** Whether feature actions currently send their events to this instance. */
  isActive: boolean;
  onSelect(): void;
}

export interface ProviderRow {
  name: string;
  /** 1-based registration position. */
  position: number;
  enabled: boolean;
  received: number;
  failed: number;
  /** True for the provider that can be made to fail on demand. */
  canFail: boolean;
}
