/* Przycisk instalacji w logowaniu; systemowa propozycja nadal jest dostępna. */
(() => {
  const button = document.getElementById("installApp");
  const area = document.getElementById("loginInstall");
  const help = document.getElementById("installHelp");
  const standalone = window.matchMedia("(display-mode: standalone)");
  let pendingPrompt = null,
    installed = false;
  function update() {
    area.hidden =
      installed || standalone.matches || navigator.standalone === true;
  }
  function instructions() {
    const ios =
      /iPhone|iPad|iPod/.test(navigator.userAgent) ||
      (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
    help.textContent = ios
      ? "W Safari wybierz Udostępnij → Do ekranu początkowego → Dodaj. Jeśli widzisz opcję „Otwórz jako aplikację”, pozostaw ją włączoną."
      : /Android/.test(navigator.userAgent)
        ? "W menu Chrome wybierz Zainstaluj aplikację lub Dodaj do ekranu głównego. Jeśli otwierasz stronę wewnątrz innej aplikacji, otwórz ją najpierw w Chrome."
        : "W menu Chrome lub Edge wybierz instalację tej strony jako aplikacji. W Safari na Macu wybierz Plik → Dodaj do Docka.";
    help.hidden = false;
  }
  window.addEventListener("beforeinstallprompt", (event) => {
    // Nie blokujemy automatycznej propozycji przeglądarki.
    pendingPrompt = event;
    update();
  });
  window.addEventListener("appinstalled", () => {
    installed = true;
    pendingPrompt = null;
    update();
  });
  standalone.addEventListener("change", update);
  button.onclick = async () => {
    const prompt = pendingPrompt;
    if (!prompt) {
      instructions();
      return;
    }
    button.disabled = true;
    help.hidden = true;
    try {
      await prompt.prompt();
      const result = await prompt.userChoice;
      if (result.outcome === "accepted") {
        installed = true;
        update();
      }
    } catch {
      instructions();
    } finally {
      pendingPrompt = null;
      button.disabled = false;
    }
  };
  update();
})();
