import { useEffect, type ReactNode } from "react";
import { createBrowserRouter, Navigate, RouterProvider } from "react-router-dom";
import { AppLayout } from "./layout/AppLayout";

import { HomePage } from "../../pages/Home";
import { CatalogPage } from "../../pages/Catalog";
import { FavoritesPage } from "../../pages/Favorites";
import { CartPage } from "../../pages/Cart";
import { CheckoutPage } from "../../pages/Checkout";
import { PaymentPage } from "../../pages/Payment";
import { PaymentSuccessPage } from "../../pages/PaymentSuccess";
import { ItemPage } from "../../pages/Item";
import { InfoPage } from "../../pages/Info";

import { AccountPage } from "../../pages/Account";
import { ProfilePage } from "../../pages/Account/Profile";
import { LoyaltyPage } from "../../pages/Account/Loyalty";
import { AddressesPage } from "../../pages/Account/Addresses";
import { OrdersPage } from "../../pages/Account/Orders";
import { OrderDetailsPage } from "../../pages/Account/OrderDetails";
import { AdminHome } from "../../pages/Admin";
import { AdminNewPostPage } from "../../pages/Admin/NewPost";
import { AdminScheduledPostsPage } from "../../pages/Admin/ScheduledPosts";
import { AdminOrdersPage } from "../../pages/Admin/Orders";
import { useAdminStore } from "../../entities/account/model/useAdminStore";

const AdminGuard = ({ children }: { children: ReactNode }) => {
  const { isAdmin, isLoading, load } = useAdminStore();

  useEffect(() => {
    void load();
  }, [load]);

  if (isLoading) return <div style={{ padding: 16 }}>Загрузка...</div>;
  if (isAdmin) return <>{children}</>;
  return <Navigate to="/account" replace />;
};

const router = createBrowserRouter([
  {
    element: <AppLayout />,
    children: [
      { path: "/", element: <HomePage /> },
      { path: "/catalog", element: <CatalogPage /> },
      { path: "/favorites", element: <FavoritesPage /> },
      { path: "/cart", element: <CartPage /> },
      { path: "/account", element: <AccountPage /> },

      { path: "/account/profile", element: <ProfilePage /> },
      { path: "/account/loyalty", element: <LoyaltyPage /> },
      { path: "/account/addresses", element: <AddressesPage /> },
      { path: "/account/orders", element: <OrdersPage /> },
      { path: "/orders/:orderId", element: <OrderDetailsPage /> },

      { path: "/admin", element: <AdminGuard><AdminHome /></AdminGuard> },
      { path: "/admin/posts/new", element: <AdminGuard><AdminNewPostPage /></AdminGuard> },
      { path: "/admin/posts/scheduled", element: <AdminGuard><AdminScheduledPostsPage /></AdminGuard> },
      { path: "/admin/posts/:id/edit", element: <AdminGuard><AdminNewPostPage /></AdminGuard> },
      { path: "/admin/orders", element: <AdminGuard><AdminOrdersPage /></AdminGuard> },

      { path: "/item/:id", element: <ItemPage /> },
      { path: "/checkout", element: <CheckoutPage /> },
      { path: "/payment", element: <PaymentPage /> },
      { path: "/payment/success", element: <PaymentSuccessPage /> },
      { path: "/info/:slug", element: <InfoPage /> },
    ],
  },
]);

export const AppRouter = () => <RouterProvider router={router} />;
export default AppRouter;
