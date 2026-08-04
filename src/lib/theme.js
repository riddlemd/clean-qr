import { getSettings, onSettingsChanged } from "./settings.js";

// "auto" leaves data-theme off so the prefers-color-scheme media query decides.
// Explicit light/dark stamp the attribute, which the CSS overrides both directions.
export function applyTheme(theme) {
  const root = document.documentElement;
  if (theme === "light" || theme === "dark") {
    root.setAttribute("data-theme", theme);
    root.style.colorScheme = theme;
  } else {
    root.removeAttribute("data-theme");
    root.style.colorScheme = "light dark";
  }
}

// Resolves what's actually on screen right now — the QR plate stays white
// regardless, but chrome-adjacent bits (e.g. canvas export padding) need the truth.
export function resolvedTheme(theme) {
  if (theme === "light" || theme === "dark") return theme;
  return matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

// Storage is async, so a non-auto override lands one frame after first paint.
// The .theme-pending class on <html> holds the page invisible until then; it is
// removed here and by a CSS-side timeout fallback so a storage failure can't
// leave a blank panel.
export async function initTheme() {
  let theme = "auto";
  try {
    ({ theme } = await getSettings());
  } catch {
    // Fall through to auto — a broken storage read must not hide the UI.
  }
  applyTheme(theme);
  document.documentElement.classList.remove("theme-pending");

  onSettingsChanged((changes, keys) => {
    if (keys.includes("theme")) applyTheme(changes.theme.newValue);
  });

  return theme;
}
