import { useState } from "react";
import { trackUserSignedIn, trackUserSignedOut } from "../../../analytics/tracking";

const DEMO_USER_ID = "demo-user";

/** A mock sign-in: only a flag, there is no real authentication. */
export function useSignIn() {
  const [signedIn, setSignedIn] = useState(false);

  function toggle(): void {
    if (signedIn) {
      trackUserSignedOut();
    } else {
      trackUserSignedIn(DEMO_USER_ID);
    }
    setSignedIn(!signedIn);
  }

  return { label: signedIn ? `Sign out (${DEMO_USER_ID})` : "Sign in (demo)", toggle };
}
