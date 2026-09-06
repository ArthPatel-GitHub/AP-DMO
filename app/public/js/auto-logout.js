/* global UserAccount, Notyf */

// ==========================================
// AUTOMATION: AUTO SIGN-OUT ON INACTIVITY
// ==========================================
// Runs in the background on every page EXCEPT the player.
// On the player, students often sit still while singing along,
// so treating that as "inactivity" would kick them out mid-practice.
// Everywhere else (catalogue, account, contact, etc.), if a
// logged-in user doesn't interact for 15 minutes, a warning
// banner appears with a live countdown. If they don't click
// "I'm still here", they are signed out automatically — this
// protects shared/library computers.

(function () {
  const INACTIVITY_LIMIT_MS = 15 * 60 * 1000; // 15 minutes
  const COUNTDOWN_SECONDS = 60;

  let inactivityTimer = null;
  let countdownInterval = null;
  let warningBanner = null;

  function isOnPlayerPage() {
    const page = (window.location.pathname.split('/').pop() || '').toLowerCase();
    return page === 'player.html' || page === 'public.html';
  }

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
      sessionStorage.setItem(
        'logout_reason',
        'You were signed out automatically due to inactivity.'
      );
    }
    window.location.href = 'login.html';
  }

  function showWarningBanner() {
    if (warningBanner || isOnPlayerPage()) return;

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

    if (isOnPlayerPage()) return;

    const account = new UserAccount();
    if (!account.isLoggedIn()) return;

    inactivityTimer = setTimeout(showWarningBanner, INACTIVITY_LIMIT_MS);
  }

  ['mousedown', 'keydown', 'scroll', 'touchstart'].forEach((eventName) => {
    document.addEventListener(eventName, () => {
      if (!warningBanner) resetTimers();
    }, { passive: true });
  });

  window.addEventListener('DOMContentLoaded', resetTimers);
})();