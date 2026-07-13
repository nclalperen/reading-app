/* =========================================================
   auth.js — a simple on-device PIN gate.
   This is NOT account security: the PIN hash lives in this
   browser's own localStorage, so anyone with access to the
   device's storage can read or clear it. It only exists to
   keep casual visitors on a shared device from opening the
   app and seeing someone else's word history.
   ========================================================= */

const Auth = {
  CONFIG_KEY: "readingapp_auth",
  UNLOCK_KEY: "readingapp_unlocked",

  async hash(text) {
    const bytes = new TextEncoder().encode(text);
    const digest = await crypto.subtle.digest("SHA-256", bytes);
    return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
  },

  isConfigured() {
    return !!localStorage.getItem(this.CONFIG_KEY);
  },

  async setPin(pin) {
    const pinHash = await this.hash(pin);
    localStorage.setItem(this.CONFIG_KEY, JSON.stringify({ pinHash }));
  },

  async verifyPin(pin) {
    const config = safeParse(localStorage.getItem(this.CONFIG_KEY), null);
    if (!config) return false;
    const pinHash = await this.hash(pin);
    return pinHash === config.pinHash;
  },

  isUnlocked() {
    return sessionStorage.getItem(this.UNLOCK_KEY) === "1";
  },

  unlock() {
    sessionStorage.setItem(this.UNLOCK_KEY, "1");
  },

  resetAll() {
    localStorage.clear();
    sessionStorage.clear();
  },
};

(function () {
  "use strict";

  const el = (id) => document.getElementById(id);
  let mode = "enter"; // "enter" | "setup"

  function revealApp() {
    el("pin-gate").hidden = true;
    el("app-shell").hidden = false;
  }

  function showError(message) {
    const error = el("pin-gate-error");
    error.textContent = message;
    error.hidden = false;
  }

  function clearError() {
    el("pin-gate-error").hidden = true;
  }

  function renderGateMode() {
    const confirmInput = el("pin-gate-confirm");
    if (mode === "setup") {
      el("pin-gate-kicker").textContent = "Set up";
      el("pin-gate-title").textContent = "Create a PIN";
      confirmInput.hidden = false;
    } else {
      el("pin-gate-kicker").textContent = "Locked";
      el("pin-gate-title").textContent = "Enter your PIN";
      confirmInput.hidden = true;
    }
  }

  async function handleGateSubmit(e) {
    e.preventDefault();
    clearError();

    const pin = el("pin-gate-input").value.trim();
    if (!pin) return;

    if (mode === "setup") {
      const confirmPin = el("pin-gate-confirm").value.trim();
      if (pin.length < 4) {
        showError("PIN must be at least 4 characters.");
        return;
      }
      if (pin !== confirmPin) {
        showError("PINs don't match.");
        return;
      }
      await Auth.setPin(pin);
      Auth.unlock();
      revealApp();
      return;
    }

    const ok = await Auth.verifyPin(pin);
    if (ok) {
      Auth.unlock();
      revealApp();
    } else {
      showError("Incorrect PIN.");
      el("pin-gate-input").value = "";
      el("pin-gate-input").focus();
    }
  }

  function handleForgotPin() {
    const confirmed = confirm(
      "This erases all word history, settings, and progress stored in this browser, and lets you set a new PIN. This cannot be undone. Continue?"
    );
    if (!confirmed) return;
    Auth.resetAll();
    location.reload();
  }

  function initGate() {
    mode = Auth.isConfigured() ? "enter" : "setup";

    if (mode === "enter" && Auth.isUnlocked()) {
      revealApp();
      return;
    }

    renderGateMode();
    el("pin-gate-form").addEventListener("submit", handleGateSubmit);
    el("pin-gate-forgot").addEventListener("click", handleForgotPin);
    el("pin-gate-input").focus();
  }

  document.addEventListener("DOMContentLoaded", initGate);
})();
