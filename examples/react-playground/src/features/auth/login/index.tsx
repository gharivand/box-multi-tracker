import { useLogin } from "./login.hook";
import type { LoginMethod } from "./login.types";

export function Login() {
  const { email, setEmail, method, setMethod, status, user, error, signIn, signOut } = useLogin();

  return (
    <section className="card">
      <h2>Login</h2>
      <p className="hint">
        Tracks <code>user_signed_in</code> after a successful sign-in, and <code>user_signed_out</code> on sign-out.
      </p>

      {user === null ? (
        <form
          className="stack"
          onSubmit={(event) => {
            event.preventDefault();
            void signIn();
          }}
        >
          <label className="field">
            Email
            <input value={email} onChange={(event) => setEmail(event.target.value)} />
          </label>
          <label className="field">
            Method
            <select value={method} onChange={(event) => setMethod(event.target.value as LoginMethod)}>
              <option value="email">email</option>
              <option value="google">google</option>
            </select>
          </label>
          <button type="submit" disabled={status === "signing-in"}>
            {status === "signing-in" ? "Signing in…" : "Sign in"}
          </button>
          {error !== null && <p className="error-text">{error}</p>}
          <p className="hint">Try an email without “@” to see that failed logins are not tracked.</p>
        </form>
      ) : (
        <div className="stack">
          <p>
            Signed in as <strong>{user.email}</strong> via <code>{user.method}</code>.
          </p>
          <button type="button" onClick={signOut}>
            Sign out
          </button>
        </div>
      )}
    </section>
  );
}
