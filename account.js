// Panel konta korzysta z tej samej sesji i wylogowania co ustawienia.
(() => {
  const modal = $("#accountModal");
  const opener = $("#accountOpen");
  function closeAccount() {
    modal.classList.remove("open");
    opener.setAttribute("aria-expanded", "false");
    if (activeSession?.user) opener.focus({ preventScroll: true });
  }
  window.updateAccountPanel = () => {
    $("#accountEmail").textContent = activeSession?.user?.email || "—";
    opener.hidden = !activeSession?.user;
    if (!activeSession?.user) {
      modal.classList.remove("open");
      opener.setAttribute("aria-expanded", "false");
    }
  };
  opener.onclick = () => {
    if (!activeSession?.user) return;
    closeUserMenu();
    window.updateAccountPanel();
    $("#accountMessage").textContent = "";
    modal.classList.add("open");
    opener.setAttribute("aria-expanded", "true");
    $("#closeAccount").focus();
  };
  $("#closeAccount").onclick = closeAccount;
  $("#accountLogout").onclick = () => $("#logout").click();
  $("#accountTheme").onclick = () => {
    closeAccount();
    openThemeModal();
  };
  modal.addEventListener("keydown", (event) => {
    if (event.key === "Escape") closeAccount();
  });
  window.updateAccountPanel();
})();
