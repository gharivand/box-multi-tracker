import type { LoginCredentials, SessionUser } from "./login.types";

const LATENCY_MS = 500;

/** Simulates authenticating against a backend. Rejects on an invalid email. */
export async function authenticate(credentials: LoginCredentials): Promise<SessionUser> {
  await new Promise<void>((resolve) => setTimeout(resolve, LATENCY_MS));

  const email = credentials.email.trim();
  if (!/^[^@\s]+@[^@\s]+$/.test(email)) {
    throw new Error("Enter a valid email address.");
  }

  return { id: `user-${email.split("@")[0]}`, email, method: credentials.method };
}
