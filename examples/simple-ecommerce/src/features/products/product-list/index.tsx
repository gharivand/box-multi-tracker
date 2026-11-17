import { formatPrice } from "../../../domain/catalog";
import { useProductList } from "./product-list.hook";

export function ProductList() {
  const { draft, query, products, setDraft, search, clear, openProduct } = useProductList();

  return (
    <section>
      <h1>Products</h1>
      <form
        className="search"
        role="search"
        onSubmit={(event) => {
          event.preventDefault();
          search();
        }}
      >
        <input
          type="search"
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          placeholder="Search products…"
          aria-label="Search products"
        />
        <button type="submit" className="button">
          Search
        </button>
        {query !== "" && (
          <button type="button" className="button button-ghost" onClick={clear}>
            Clear
          </button>
        )}
      </form>

      {products.length === 0 ? (
        <p className="muted">No products match “{query}”.</p>
      ) : (
        <ul className="product-grid">
          {products.map((product) => (
            <li key={product.id}>
              <button type="button" className="product-card" onClick={() => openProduct(product)}>
                <span className="product-image" style={{ background: product.color }} aria-hidden="true">
                  {product.emoji}
                </span>
                <span className="product-name">{product.name}</span>
                <span className="product-price">{formatPrice(product.price)}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
