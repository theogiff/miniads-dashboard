(function initAdminLogin() {
  const form = document.getElementById("adminLoginForm") || document.querySelector(".login-form");
  if (!form) return;

  const emailInput = document.getElementById("adminEmail");
  const passwordInput = document.getElementById("adminPassword");
  const errorEl = document.getElementById("adminLoginError");
  const params = new URLSearchParams(window.location.search);
  const defaultRedirect = "./index.html?mode=admin";
  const rawRedirect = params.get("redirect") || params.get("next");
  const redirectTarget = rawRedirect && /^https?:\/\//i.test(rawRedirect)
    ? defaultRedirect
    : (rawRedirect || defaultRedirect);

  const redirectToDashboard = () => {
    window.location.href = redirectTarget;
  };

  fetch("/api/admin/me", { credentials: "include" })
    .then(response => {
      if (response.ok) redirectToDashboard();
    })
    .catch(() => {});

  form.addEventListener("submit", event => {
    event.preventDefault();

    const enteredEmail = emailInput ? emailInput.value.trim().toLowerCase() : "";
    const enteredPassword = passwordInput ? passwordInput.value : "";

    fetch("/api/admin/login", {
      method: "POST",
      credentials: "include",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ email: enteredEmail, password: enteredPassword })
    })
      .then(async response => {
        if (response.ok) {
          if (errorEl) errorEl.textContent = "";
          redirectToDashboard();
          return;
        }
        const payload = await response.json().catch(() => null);
        const message = (payload && payload.error) || "Identifiants incorrects. Veuillez réessayer.";
        if (errorEl) errorEl.textContent = message;
        if (passwordInput) {
          passwordInput.value = "";
          passwordInput.focus();
        }
      })
      .catch(() => {
        if (errorEl) errorEl.textContent = "Impossible de se connecter. Réessaie dans un instant.";
      });
  });
})();
