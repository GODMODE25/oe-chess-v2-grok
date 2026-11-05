import { useEffect } from "react";
import { useOe } from "./store";

/**
 * Puts the chosen theme on <html> so its tokens cascade everywhere, then lets
 * the browser chrome follow the theme's own canvas colour instead of a hard-coded hex.
 */
export function useAppThemeSync() {
  const theme = useOe((s) => s.settings.appTheme ?? "brass");
  useEffect(() => {
    const root = document.documentElement;
    root.dataset.appTheme = theme;
    const canvas = getComputedStyle(root).getPropertyValue("--color-canvas").trim();
    if (canvas) {
      document.querySelector('meta[name="theme-color"]')?.setAttribute("content", canvas);
    }
  }, [theme]);
}
