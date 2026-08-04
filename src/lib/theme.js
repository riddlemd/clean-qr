import { getSettings, onSettingsChanged } from "./settings.js";

// "auto" leaves data-theme off so the media query decides; an explicit choice
// stamps the attribute, which out-specifies the media query in both directions.
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

// Storage is async, so an override lands a frame after first paint; .theme-pending
// hides the page until this clears it. theme.css carries the failure-path reveal.
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
