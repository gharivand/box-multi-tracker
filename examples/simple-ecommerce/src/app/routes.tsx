import { CartView } from "../features/cart/cart-view";
import { OrderConfirmation } from "../features/checkout/order-confirmation";
import { PlaceOrder } from "../features/checkout/place-order";
import { ProductDetails } from "../features/products/product-details";
import { ProductList } from "../features/products/product-list";
import { useShop } from "./providers/shop.context";

/** Renders the page for the current route. Each feature owns its own behavior. */
export function RouteView() {
  const { route } = useShop();

  switch (route.page) {
    case "products":
      return <ProductList />;
    case "product":
      return <ProductDetails productId={route.productId} />;
    case "cart":
      return <CartView />;
    case "checkout":
      return <PlaceOrder />;
    case "confirmation":
      return <OrderConfirmation orderId={route.orderId} total={route.total} />;
  }
}
