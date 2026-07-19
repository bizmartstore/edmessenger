import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet,
  createRootRouteWithContext,
  HeadContent,
  Scripts,
} from "@tanstack/react-router";
import { type ReactNode } from "react";
import { Toaster } from "sonner";

import appCss from "../styles.css?url";
import { AuthProvider } from "@/hooks/useAuth";
import { PushNotifications } from "@/components/PushNotifications";

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1, viewport-fit=cover, maximum-scale=1" },
      { name: "theme-color", content: "#1e40af" },
      { name: "apple-mobile-web-app-capable", content: "yes" },
      { name: "apple-mobile-web-app-status-bar-style", content: "black-translucent" },
      { name: "apple-mobile-web-app-title", content: "EdMessenger" },
      { name: "mobile-web-app-capable", content: "yes" },
      { title: "EdMessenger — Learn. Communicate. Succeed." },
      { name: "description", content: "One school. One app. Limitless connections. A mobile-first classroom messenger: chat, share lessons, take quizzes, and check attendance." },
      { name: "author", content: "EdMessenger" },
      { property: "og:site_name", content: "EdMessenger" },
      { property: "og:title", content: "EdMessenger — Learn. Communicate. Succeed." },
      { property: "og:description", content: "Empowering students. Connecting teachers. Strengthening schools." },
      { property: "og:type", content: "website" },
      { property: "og:image", content: "/logo.png" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:image", content: "/logo.png" },
    ],
    links: [
      { rel: "stylesheet", href: appCss },
      { rel: "icon", type: "image/png", href: "/logo-pwa.png" },
      { rel: "apple-touch-icon", href: "/icons/icon-192.png" },
      { rel: "manifest", href: "/manifest.webmanifest" },
    ],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: () => (
    <div className="min-h-screen grid place-items-center p-6 text-center">
      <div>
        <div className="text-6xl font-bold text-primary">404</div>
        <div className="mt-2 text-muted-foreground">Page not found</div>
        <a href="/" className="mt-4 inline-block px-4 py-2 rounded-xl gradient-primary text-primary-foreground text-sm font-semibold">Go home</a>
      </div>
    </div>
  ),
  errorComponent: ({ error }) => (
    <div className="min-h-screen grid place-items-center p-6 text-center">
      <div>
        <div className="text-xl font-semibold">Something went wrong</div>
        <div className="mt-2 text-sm text-muted-foreground max-w-md">{error?.message}</div>
        <a href="/" className="mt-4 inline-block px-4 py-2 rounded-xl gradient-primary text-primary-foreground text-sm font-semibold">Reload</a>
      </div>
    </div>
  ),
});

function RootShell({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function RootComponent() {
  const { queryClient } = Route.useRouteContext();
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <Outlet />
        <PushNotifications />
        <Toaster position="top-center" richColors closeButton />
      </AuthProvider>
    </QueryClientProvider>
  );
}
