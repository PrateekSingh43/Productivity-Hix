"use client";

import React, { createContext, useContext, useEffect, useState } from "react";

export type ThemeMode = "light" | "dark" | "system";

interface ThemeContextValue {
  theme: ThemeMode;
  resolvedTheme: "light" | "dark";
  setTheme: (theme: ThemeMode) => void;
}

const ThemeContext = createContext<ThemeContextValue | undefined>(undefined);

function getSystemTheme(): "light" | "dark" {
  if (typeof window === "undefined") return "dark";
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function applyThemeToDom(theme: ThemeMode): "light" | "dark" {
  if (typeof document === "undefined") return "dark";
  const resolved = theme === "system" ? getSystemTheme() : theme;

  document.documentElement.setAttribute("data-theme", theme);
  if (resolved === "dark") {
    document.documentElement.classList.remove("light");
    document.documentElement.classList.add("dark");
  } else {
    document.documentElement.classList.remove("dark");
    document.documentElement.classList.add("light");
  }

  return resolved;
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = useState<ThemeMode>("dark");
  const [resolvedTheme, setResolvedTheme] = useState<"light" | "dark">("dark");
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    try {
      const saved = localStorage.getItem("theme") as ThemeMode | null;
      const initialTheme: ThemeMode =
        saved === "light" || saved === "dark" || saved === "system" ? saved : "dark";
      setThemeState(initialTheme);
      const resolved = applyThemeToDom(initialTheme);
      setResolvedTheme(resolved);
    } catch {
      const resolved = applyThemeToDom("dark");
      setResolvedTheme(resolved);
    }
    setMounted(true);
  }, []);

  const setTheme = (newTheme: ThemeMode) => {
    setThemeState(newTheme);
    try {
      localStorage.setItem("theme", newTheme);
    } catch {}
    const resolved = applyThemeToDom(newTheme);
    setResolvedTheme(resolved);
  };

  // Listen to OS system color-scheme changes if current theme is system
  useEffect(() => {
    if (!mounted || typeof window === "undefined") return;

    const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
    const handleChange = () => {
      if (theme === "system") {
        const resolved = applyThemeToDom("system");
        setResolvedTheme(resolved);
      }
    };

    mediaQuery.addEventListener("change", handleChange);

    // Cross-tab theme sync
    const handleStorage = (e: StorageEvent) => {
      if (e.key === "theme" && e.newValue) {
        const nextTheme = e.newValue as ThemeMode;
        if (nextTheme === "light" || nextTheme === "dark" || nextTheme === "system") {
          setThemeState(nextTheme);
          const resolved = applyThemeToDom(nextTheme);
          setResolvedTheme(resolved);
        }
      }
    };
    window.addEventListener("storage", handleStorage);

    return () => {
      mediaQuery.removeEventListener("change", handleChange);
      window.removeEventListener("storage", handleStorage);
    };
  }, [mounted, theme]);

  return (
    <ThemeContext.Provider value={{ theme, resolvedTheme, setTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error("useTheme must be used within a ThemeProvider");
  }
  return context;
}
