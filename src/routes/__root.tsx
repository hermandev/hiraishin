import { createRootRoute, Outlet } from "@tanstack/react-router";
import { TanStackRouterDevtools } from "@tanstack/react-router-devtools";
import TitleBar from "@/shared/components/title-bar";

const RootLayout = () => {
  return (
    <div className="h-screen w-screen bg-transparent">
      <div className="h-full w-full">
        <TitleBar />
        <Outlet />
      </div>
      <TanStackRouterDevtools />
    </div>
  );
};

export const Route = createRootRoute({ component: RootLayout });
