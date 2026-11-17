import { useSignIn } from "./sign-in.hook";

export function SignIn() {
  const { label, toggle } = useSignIn();

  return (
    <button type="button" className="button" onClick={toggle}>
      {label}
    </button>
  );
}
