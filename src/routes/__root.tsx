import { createRootRoute, Outlet } from "@tanstack/react-router";
import { TanStackRouterDevtools } from "@tanstack/react-router-devtools";
import TitleBar from "@/shared/components/title-bar";

const RootLayout = () => {
  return (
    <div className="h-screen w-screen bg-transparent">
      <div className="flex h-full min-h-0 w-full flex-col">
        <TitleBar />
        <main className="min-h-0 flex-1 overflow-hidden">
          <Outlet />
        </main>
      </div>
      <TanStackRouterDevtools />
    </div>
  );
};

export const Route = createRootRoute({ component: RootLayout });
