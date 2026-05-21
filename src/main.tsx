import { createRouter, RouterProvider } from "@tanstack/react-router";
import { StrictMode } from "react";
import ReactDOM from "react-dom/client";
import "./index.css";

import { routeTree } from "./routeTree.gen";
import { Toaster } from "./components/ui/sonner";
import { SshTerminalProvider } from "./shared/provider/ssh-terminals";
import TanStackQueryProvider from "./shared/provider/tanstack-query";
import { ThemeProvider } from "./shared/provider/theme";

const router = createRouter({ routeTree });

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}

const rootElement = document.getElementById("root") as HTMLElement;
if (!rootElement.innerHTML) {
  const root = ReactDOM.createRoot(rootElement);
  root.render(
    <StrictMode>
      <ThemeProvider>
        <TanStackQueryProvider>
          <SshTerminalProvider>
            <RouterProvider router={router} />
            <Toaster />
          </SshTerminalProvider>
        </TanStackQueryProvider>
      </ThemeProvider>
    </StrictMode>,
  );
}
