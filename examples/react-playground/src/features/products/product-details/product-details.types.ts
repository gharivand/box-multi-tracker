import type { Tracking } from "../../../analytics/tracking";

/** The only part of the tracking API this feature needs. */
export type ProductTracking = Pick<Tracking, "productViewed">;

export type ProductLoadStatus = "idle" | "loading" | "loaded" | "error";
