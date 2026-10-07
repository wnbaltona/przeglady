// Wspólna obsługa formularzy, okien i informacji o połączeniu.
function setFormFeedback(form, message = "") {
  let feedback = form.querySelector(".form-feedback");
  if (!feedback) {
    feedback = document.createElement("p");
    feedback.className = "form-feedback";
    feedback.setAttribute("role", "alert");
    form.insertBefore(feedback, form.querySelector("footer"));
  }
  feedback.textContent = message;
  feedback.hidden = !message;
  if (message) {
    feedback.tabIndex = -1;
    feedback.focus({ preventScroll: true });
    feedback.scrollIntoView({ block: "nearest" });
  }
}
function setFormBusy(form, busy, text = "Zapisywanie…") {
  form.setAttribute("aria-busy", String(busy));
  form.querySelectorAll("button, input, select, textarea").forEach((button) => {
    if (busy) {
      button.dataset.idleDisabled = String(button.disabled);
      button.disabled = true;
    } else if (button.dataset.idleDisabled !== undefined) {
      button.disabled = button.dataset.idleDisabled === "true";
      delete button.dataset.idleDisabled;
    }
    if (button.tagName === "BUTTON" && button.type === "submit") {
      if (busy) {
        button.dataset.idleLabel = button.textContent;
        button.textContent = text;
      } else if (button.dataset.idleLabel) {
        button.textContent = button.dataset.idleLabel;
        delete button.dataset.idleLabel;
      }
    }
  });
}

(() => {
  const closeButtons = {
    editModal: "cancel",
    localModal: "cancelLocal",
    typesModal: "closeTypes",
    trashModal: "closeTrash",
    historyModal: "closeHistory",
    themeModal: "closeTheme",
    attentionModal: "closeAttention",
    recordDetailModal: "closeRecordDetail",
  };
  const opened = new Map();
  const disabledBackground = new Set();
  let topModal = null;
  let opener = null;
  const visible = (element) =>
    element.getClientRects().length > 0 && !element.hidden;
  const focusable = (modal) =>
    [
      ...modal.querySelectorAll(
        'button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), a[href], [tabindex="0"]',
      ),
    ].filter((element) => visible(element) && !element.closest("[inert]"));

  document.addEventListener(
    "click",
    (event) => {
      opener =
        event.target.closest("button, a, [role='button']") ||
        document.activeElement;
    },
    true,
  );
  function syncDialogs() {
    const active = [
      ...document.querySelectorAll(".modal.open:not(.workspace-view)"),
    ].filter(visible);
    let returnTo = null;
    for (const [modal, trigger] of opened) {
      if (!active.includes(modal)) {
        returnTo = trigger;
        opened.delete(modal);
      }
    }
    for (const modal of active) {
      if (!opened.has(modal)) opened.set(modal, opener);
    }
    const next = [...opened.keys()].at(-1) || null;
    for (const element of disabledBackground) element.inert = false;
    disabledBackground.clear();
    if (next) {
      for (const element of document.body.children) {
        if (
          element !== next &&
          !["SCRIPT", "DATALIST"].includes(element.tagName)
        ) {
          if (!element.inert) {
            element.inert = true;
            disabledBackground.add(element);
          }
        }
      }
      const dialog = next.querySelector(".dialog");
      const heading = dialog?.querySelector("h2");
      dialog?.setAttribute("role", "dialog");
      dialog?.setAttribute("aria-modal", "true");
      if (heading) {
        heading.id ||= `${next.id}Title`;
        dialog.setAttribute("aria-labelledby", heading.id);
      }
      if (next !== topModal && !next.contains(document.activeElement)) {
        const target = heading || focusable(next)[0] || dialog;
        if (target) {
          target.tabIndex = -1;
          target.focus({ preventScroll: true });
        }
      }
    } else if (topModal && !document.body.classList.contains("auth-screen")) {
      const target =
        returnTo?.isConnected && visible(returnTo)
          ? returnTo
          : document.querySelector("#headerLogout:not([hidden])");
      target?.focus({ preventScroll: true });
    }
    topModal = next;
  }
  document.addEventListener(
    "keydown",
    (event) => {
      if (!topModal) return;
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopImmediatePropagation();
        const close = document.getElementById(closeButtons[topModal.id]);
        if (close && !close.disabled) close.click();
      }
      if (event.key === "Tab") {
        const items = focusable(topModal);
        const index = items.indexOf(document.activeElement);
        if (!items.length) {
          event.preventDefault();
          return;
        }
        if (event.shiftKey && index <= 0) {
          event.preventDefault();
          items.at(-1).focus();
        } else if (
          !event.shiftKey &&
          (index === items.length - 1 || index < 0)
        ) {
          event.preventDefault();
          items[0].focus();
        }
      }
    },
    true,
  );
  new MutationObserver(syncDialogs).observe(document.body, {
    subtree: true,
    attributes: true,
    attributeFilter: ["class", "hidden"],
  });
  syncDialogs();

  const password = document.querySelector('#loginForm input[name="password"]');
  document.getElementById("passwordToggle").onclick = () => {
    const showing = password.type === "password";
    password.type = showing ? "text" : "password";
    document.getElementById("passwordToggle").textContent = showing
      ? "Ukryj"
      : "Pokaż";
    document
      .getElementById("passwordToggle")
      .setAttribute("aria-pressed", String(showing));
  };
  const inspectionForm = document.getElementById("editForm");
  const preview = document.getElementById("nextDatePreview");
  function updateNextDate() {
    const expiry = nextDate(
      inspectionForm.elements.done.value,
      Number(inspectionForm.elements.months.value),
    );
    preview.textContent = expiry
      ? `Następny termin: ${fmt(expiry)}`
      : "Wybierz datę wykonania i okres ważności, aby zobaczyć następny termin.";
  }
  inspectionForm.addEventListener("input", updateNextDate);
  inspectionForm.addEventListener("change", updateNextDate);
  new MutationObserver(() => {
    if (document.getElementById("editModal").classList.contains("open")) {
      setFormFeedback(inspectionForm);
      updateNextDate();
    }
  }).observe(document.getElementById("editModal"), {
    attributes: true,
    attributeFilter: ["class"],
  });
  new MutationObserver(() => {
    if (document.getElementById("localModal").classList.contains("open"))
      setFormFeedback(document.getElementById("localForm"));
  }).observe(document.getElementById("localModal"), {
    attributes: true,
    attributeFilter: ["class"],
  });
  document.addEventListener("click", (event) => {
    if (event.target.closest("[data-empty-clear]"))
      document.getElementById("clearFilters").click();
    if (event.target.closest("[data-empty-add]"))
      document.getElementById("add").click();
  });

  const connection = document.getElementById("connectionNotice");
  function updateConnection() {
    connection.hidden = navigator.onLine;
  }
  window.addEventListener("online", updateConnection);
  window.addEventListener("offline", updateConnection);
  updateConnection();
})();
