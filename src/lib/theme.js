import { getSettings, onSettingsChanged } from "./settings.js";

// "auto" leaves data-theme off so the media query decides; an explicit choice
// stamps the attribute, which out-specifies the media query in both directions.
// color-scheme rides along in theme.css keyed on the same attribute.
export function applyTheme(theme) {
  const root = document.documentElement;
  if (theme === "light" || theme === "dark") {
    root.setAttribute("data-theme", theme);
  } else {
    root.removeAttribute("data-theme");
  }
}

// Storage is async, so an override lands a frame after first paint; .theme-pending
// hides the page until this clears it. theme.css carries the failure-path reveal.
// Accepts the caller's in-flight getSettings() so the read isn't duplicated.
export async function initTheme(settingsPromise) {
  let theme = "auto";
  try {
    ({ theme } = await (settingsPromise ?? getSettings()));
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
