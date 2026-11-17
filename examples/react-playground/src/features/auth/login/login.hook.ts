import { useState } from "react";
import { useTracking } from "../../../app/providers/playground.context";
import { authenticate } from "./auth.service";
import type { LoginMethod, LoginStatus, LoginTracking, SessionUser } from "./login.types";

export function useLogin() {
  const tracking: LoginTracking = useTracking();
  const [email, setEmail] = useState("ada@example.com");
  const [method, setMethod] = useState<LoginMethod>("email");
  const [status, setStatus] = useState<LoginStatus>("signed-out");
  const [user, setUser] = useState<SessionUser | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function signIn(): Promise<void> {
    setStatus("signing-in");
    setError(null);

    let authenticated: SessionUser;
    try {
      authenticated = await authenticate({ email, method });
    } catch (failure) {
      // A failed login is not an analytics event: nothing is tracked.
      setError(failure instanceof Error ? failure.message : "Sign-in failed.");
      setStatus("signed-out");
      return;
    }

    setUser(authenticated);
    setStatus("signed-in");
    // Tracked only after the sign-in actually succeeded.
    tracking.userSignedIn({ userId: authenticated.id, method: authenticated.method });
  }

  function signOut(): void {
    setUser(null);
    setStatus("signed-out");
    tracking.userSignedOut();
  }

  return { email, setEmail, method, setMethod, status, user, error, signIn, signOut };
}
