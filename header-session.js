// Przycisk w nagłówku korzysta ze wspólnej obsługi wylogowania.
(() => {
  const logout = $("#headerLogout");
  window.updateHeaderSession = () => {
    logout.hidden = !activeSession?.user;
  };
  logout.onclick = () => $("#logout").click();
  window.updateHeaderSession();
})();
