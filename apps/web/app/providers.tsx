"use client";

import { QueryClientProvider } from "@tanstack/react-query";
import { ReactQueryDevtools } from "@tanstack/react-query-devtools";
import { useState } from "react";
import { createQueryClient } from "../src/lib/query-client";
import { ThemeProvider } from "../src/lib/theme-provider";
import { SidebarProvider } from "../src/lib/sidebar-context";

export function Providers({ children }: Readonly<{ children: React.ReactNode }>) {
  const [queryClient] = useState(createQueryClient);
  return (
    <ThemeProvider>
      <SidebarProvider>
        <QueryClientProvider client={queryClient}>
          {children}
          <ReactQueryDevtools initialIsOpen={false} />
        </QueryClientProvider>
      </SidebarProvider>
    </ThemeProvider>
  );
}
