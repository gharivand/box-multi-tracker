import { useProductDetails } from "./product-details.hook";

export function ProductDetails() {
  const { products, product, status, error, viewProduct } = useProductDetails();

  return (
    <section className="card">
      <h2>Product details</h2>
      <p className="hint">
        Tracks <code>product_viewed</code> once the details have loaded.
      </p>

      <div className="row">
        {products.map((candidate) => (
          <button
            key={candidate.id}
            type="button"
            disabled={status === "loading"}
            onClick={() => void viewProduct(candidate.id)}
          >
            {candidate.name}
          </button>
        ))}
      </div>

      {status === "loading" && <p className="hint">Loading…</p>}
      {error !== null && <p className="error-text">{error}</p>}
      {status === "loaded" && product !== null && (
        <div className="detail">
          <strong>{product.name}</strong>
          <span>${product.price.toFixed(2)}</span>
          <p className="hint">{product.description}</p>
        </div>
      )}
    </section>
  );
}
