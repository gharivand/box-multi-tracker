import { SignIn } from "../../features/auth/sign-in";
import { useHeader } from "./header.hook";

export function Header() {
  const { cartCount, goToProducts, goToCart } = useHeader();

  return (
    <header className="header">
      <button type="button" className="brand" onClick={goToProducts}>
        📦 Box Shop
      </button>
      <nav className="nav">
        <button type="button" className="button button-ghost" onClick={goToProducts}>
          Products
        </button>
        <button type="button" className="button button-ghost" onClick={goToCart}>
          Cart ({cartCount})
        </button>
        <SignIn />
      </nav>
    </header>
  );
}
