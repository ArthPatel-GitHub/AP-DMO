/* global UserAccount, Notyf */

// ==========================================
// AUTOMATION: AUTO SIGN-OUT ON INACTIVITY
// ==========================================
// Runs independently in the background on every page. If a
// logged-in user doesn't interact with the page for a set
// period, a warning banner appears with a live countdown and a
// "I'm still here" button. If they don't respond in time, they
// are automatically signed out and redirected to the homepage -
// protects against someone staying logged in on a shared/library
// computer after walking away.

(function () {
const INACTIVITY_LIMIT_MS = 10 * 60 * 1000; // 10 minutes
const COUNTDOWN_SECONDS = 60; // 60 second warning countdown

  let inactivityTimer = null;
  let countdownInterval = null;
  let warningBanner = null;

  function removeWarningBanner() {
    if (warningBanner) {
      warningBanner.remove();
      warningBanner = null;
    }
    if (countdownInterval) {
      clearInterval(countdownInterval);
      countdownInterval = null;
    }
  }

  function performLogout() {
    removeWarningBanner();
    const account = new UserAccount();
    if (account.isLoggedIn()) {
      account.logOut();
      window.dispatchEvent(new CustomEvent('auth-state-changed'));
      sessionStorage.setItem('logout_reason', 'You were signed out automatically due to inactivity.');
    }
    window.location.href = 'index.html';
  }

  function showWarningBanner() {
    if (warningBanner) return; // already showing, don't duplicate

    let secondsLeft = COUNTDOWN_SECONDS;

    warningBanner = document.createElement('div');
    warningBanner.className = 'inactivity-warning';
    warningBanner.innerHTML = `
      <div class="inactivity-warning-title">⚠️ Still there?</div>
      <div class="inactivity-warning-text">
        You'll be signed out in <span class="inactivity-warning-countdown" id="inactivity-countdown">${secondsLeft}</span> seconds due to inactivity.
      </div>
    `;

    const stayBtn = document.createElement('button');
    stayBtn.type = 'button';
    stayBtn.className = 'btn inactivity-warning-btn';
    stayBtn.textContent = "I'm still here";
    stayBtn.addEventListener('click', () => {
      removeWarningBanner();
      resetTimers();
      if (typeof Notyf !== 'undefined') {
        const notyf = new Notyf({ duration: 2000, position: { x: 'right', y: 'bottom' } });
        notyf.success('Session kept active.');
      }
    });

    warningBanner.appendChild(stayBtn);
    document.body.appendChild(warningBanner);

    const countdownEl = document.getElementById('inactivity-countdown');
    countdownInterval = setInterval(() => {
      secondsLeft -= 1;
      if (countdownEl) countdownEl.textContent = secondsLeft;
      if (secondsLeft <= 0) {
        clearInterval(countdownInterval);
        performLogout();
      }
    }, 1000);
  }

  function resetTimers() {
    clearTimeout(inactivityTimer);
    removeWarningBanner();

    const account = new UserAccount();
    if (!account.isLoggedIn()) return; // nothing to automate for a guest

    inactivityTimer = setTimeout(showWarningBanner, INACTIVITY_LIMIT_MS);
  }

  // Any of these user actions counts as "active" and resets the clock -
  // but only when the warning banner ISN'T showing, since once it's up
  // we want the user to make a deliberate choice (click the button),
  // not have incidental mouse movement silently dismiss it.
  ['mousedown', 'keydown', 'scroll', 'touchstart'].forEach((eventName) => {
    document.addEventListener(eventName, () => {
      if (!warningBanner) resetTimers();
    }, { passive: true });
  });

  window.addEventListener('DOMContentLoaded', resetTimers);
})();