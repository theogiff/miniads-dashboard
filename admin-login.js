(function initAdminLogin() {
  const form = document.getElementById("adminLoginForm") || document.querySelector(".login-form");
  if (!form) return;

  const emailInput = document.getElementById("adminEmail");
  const passwordInput = document.getElementById("adminPassword");
  const errorEl = document.getElementById("adminLoginError");
  const auth = window.MINIADS_ADMIN_AUTH || {};
  const expectedEmail = (auth.email || "").trim().toLowerCase();
  const expectedPassword = auth.password || "";
  const sessionKey = auth.sessionKey || "miniads-admin-session";
  const params = new URLSearchParams(window.location.search);
  const defaultRedirect = "./index.html?mode=admin";
  const rawRedirect = params.get("redirect") || params.get("next");
  const redirectTarget = rawRedirect && /^https?:\/\//i.test(rawRedirect)
    ? defaultRedirect
    : (rawRedirect || defaultRedirect);

  const redirectToDashboard = () => {
    window.location.href = redirectTarget;
  };

  if (sessionStorage.getItem(sessionKey) === "1") {
    redirectToDashboard();
    return;
  }

  form.addEventListener("submit", event => {
    event.preventDefault();

    const enteredEmail = emailInput ? emailInput.value.trim().toLowerCase() : "";
    const enteredPassword = passwordInput ? passwordInput.value : "";

    const isValid = enteredEmail === expectedEmail && enteredPassword === expectedPassword;

    if (isValid) {
      sessionStorage.setItem(sessionKey, "1");
      if (errorEl) errorEl.textContent = "";
      redirectToDashboard();
    } else {
      if (errorEl) {
        errorEl.textContent = "Identifiants incorrects. Veuillez réessayer.";
      }
      if (passwordInput) {
        passwordInput.value = "";
        passwordInput.focus();
      }
    }
  });
})();
