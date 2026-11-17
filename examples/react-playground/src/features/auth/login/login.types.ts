import type { AppEvents } from "../../../analytics/events";
import type { Tracking } from "../../../analytics/tracking";

export type LoginMethod = AppEvents["user_signed_in"]["method"];

/** The only part of the tracking API this feature needs. */
export type LoginTracking = Pick<Tracking, "userSignedIn" | "userSignedOut">;

export interface LoginCredentials {
  email: string;
  method: LoginMethod;
}

export interface SessionUser {
  id: string;
  email: string;
  method: LoginMethod;
}

export type LoginStatus = "signed-out" | "signing-in" | "signed-in";
