/* global UserAccount, Notyf */

// ==========================================
// AUTOMATION: AUTO SIGN-OUT ON INACTIVITY
// ==========================================
// Runs independently in the background on every page. If a
// logged-in user doesn't interact with the page for a set
// period, they're automatically signed out - protects against
// someone staying logged in on a shared/library computer after
// walking away. Shows a warning toast before it happens, so the
// user has a chance to stay logged in by simply interacting again.

(function () {
  const INACTIVITY_LIMIT_MS = 10 * 60 * 1000; // 10 minutes
  const WARNING_BEFORE_MS = 60 * 1000; // warn 1 minute before logout

  let inactivityTimer = null;
  let warningTimer = null;

  function resetTimers() {
    clearTimeout(inactivityTimer);
    clearTimeout(warningTimer);

    const account = new UserAccount();
    if (!account.isLoggedIn()) return; // nothing to automate for a guest

    warningTimer = setTimeout(() => {
      if (typeof Notyf !== 'undefined') {
        const notyf = new Notyf({ duration: 8000, position: { x: 'right', y: 'bottom' } });
        notyf.error('You will be signed out in 1 minute due to inactivity.');
      }
    }, INACTIVITY_LIMIT_MS - WARNING_BEFORE_MS);

    inactivityTimer = setTimeout(() => {
      const stillLoggedInAccount = new UserAccount();
      if (stillLoggedInAccount.isLoggedIn()) {
        stillLoggedInAccount.logOut();
        window.dispatchEvent(new CustomEvent('auth-state-changed'));
        sessionStorage.setItem('logout_reason', 'You were signed out automatically due to inactivity.');
        window.location.href = 'login.html';
      }
    }, INACTIVITY_LIMIT_MS);
  }

  // Any of these user actions counts as "active" and resets the clock
  ['mousedown', 'keydown', 'scroll', 'touchstart'].forEach((eventName) => {
    document.addEventListener(eventName, resetTimers, { passive: true });
  });

  window.addEventListener('DOMContentLoaded', resetTimers);
})();