/* Applied in <head> so the saved theme is visible before the first paint. */
(() => {
  const storageKey = "meu-enem:tema";
  const systemTheme = window.matchMedia("(prefers-color-scheme: dark)");
  let preference;
  try {
    preference = localStorage.getItem(storageKey);
  } catch {
    /* Storage may be unavailable. */
  }

  function applyTheme(dark) {
    document.documentElement.dataset.theme = dark ? "dark" : "light";
    document
      .querySelector('meta[name="theme-color"]')
      ?.setAttribute("content", dark ? "#171522" : "#6547de");
    const button = document.querySelector(".theme-toggle");
    if (button) {
      button.textContent = dark ? "☀ Modo claro" : "☾ Modo escuro";
      button.setAttribute("aria-pressed", String(dark));
      button.setAttribute("aria-label", dark ? "Ativar modo claro" : "Ativar modo escuro");
    }
  }

  const isDark = () => preference === "dark" || (preference !== "light" && systemTheme.matches);
  applyTheme(isDark());
  systemTheme.addEventListener("change", () => applyTheme(isDark()));
  document.addEventListener("DOMContentLoaded", () => {
    applyTheme(isDark());
    document.querySelector(".theme-toggle")?.addEventListener("click", () => {
      preference = document.documentElement.dataset.theme === "dark" ? "light" : "dark";
      try {
        localStorage.setItem(storageKey, preference);
      } catch {
        /* Keep working without persistence. */
      }
      applyTheme(isDark());
    });
  });
})();
