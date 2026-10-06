/* Propozycja instalacji PWA oraz instrukcja dla przeglądarek bez prompt(). */
(() => {
  const modal = document.getElementById("installModal");
  const button = document.getElementById("installApp");
  const instructions = document.getElementById("installInstructions");
  const standalone = window.matchMedia("(display-mode: standalone)");
  const key = "przeglady:install-dismissed";
  let deferredPrompt = null,
    dismissed = false,
    installed = false;
  try {
    dismissed = sessionStorage.getItem(key) === "1";
  } catch {}
  const isInstalled = () =>
    installed || standalone.matches || navigator.standalone === true;
  function update() {
    button.hidden = !deferredPrompt;
    instructions.hidden = Boolean(deferredPrompt);
    const ios =
      /iPad|iPhone|iPod/.test(navigator.userAgent) ||
      (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
    if (ios) {
      instructions.textContent =
        "Otwórz stronę w Safari. Wybierz Udostępnij → Do ekranu początkowego, a następnie Dodaj. Jeśli pojawi się opcja „Otwórz jako aplikację”, pozostaw ją włączoną.";
    } else if (/Android/.test(navigator.userAgent)) {
      instructions.textContent =
        "W menu przeglądarki wybierz Zainstaluj aplikację lub Dodaj do ekranu głównego. Jeśli używasz przeglądarki wewnątrz innej aplikacji, otwórz stronę w Chrome.";
    } else {
      instructions.textContent =
        "W menu Chrome lub Edge wybierz opcję instalacji tej strony jako aplikacji. W Safari na Macu wybierz Plik → Dodaj do Docka.";
    }
    document.getElementById("installLater").textContent = deferredPrompt
      ? "Później"
      : "Rozumiem";
  }
  function close() {
    dismissed = true;
    try {
      sessionStorage.setItem(key, "1");
    } catch {}
    modal.classList.remove("open");
  }
  function show() {
    if (dismissed || isInstalled()) return;
    update();
    modal.classList.add("open");
    (deferredPrompt ? button : document.getElementById("installLater")).focus({
      preventScroll: true,
    });
  }
  document.getElementById("closeInstall").onclick = close;
  document.getElementById("installLater").onclick = close;
  modal.addEventListener("click", (event) => {
    if (event.target === modal) close();
  });
  window.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault();
    deferredPrompt = event;
    update();
    if (!dismissed && !isInstalled()) show();
  });
  button.onclick = async () => {
    const prompt = deferredPrompt;
    if (!prompt) return;
    button.disabled = true;
    try {
      await prompt.prompt();
      const result = await prompt.userChoice;
      if (result.outcome === "accepted") installed = true;
      close();
    } catch {
      // Pozostaje dostępna ręczna instalacja z menu przeglądarki.
      deferredPrompt = null;
      update();
    } finally {
      deferredPrompt = null;
      button.disabled = false;
    }
  };
  window.addEventListener("appinstalled", () => {
    installed = true;
    close();
  });
  standalone.addEventListener("change", () => {
    if (isInstalled()) close();
  });
  window.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && modal.classList.contains("open")) close();
  });
  setTimeout(show, 900);
})();
