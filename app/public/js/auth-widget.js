/* global UserAccount */

// ==========================================
// AUTH WIDGET: persistent nav-bar login indicator
// ==========================================
// Renders into a container at the end of .main-nav on every
// page. Shows a generic "Login / Sign Up" prompt when logged
// out, or the user's name + an initials avatar when logged in,
// with a click-to-open dropdown showing account details and a
// Sign Out button.
//
// This is intentionally a single shared component rather than
// duplicated per-page logic, so the logged-in/out behaviour is
// guaranteed identical everywhere it appears.

window.addEventListener('DOMContentLoaded', () => {
  const container = document.getElementById('auth-widget');
  if (!container) return; // safety guard - page may not have the widget mounted

  const account = new UserAccount();

  function getInitials(fullName) {
    return fullName
      .split(' ')
      .filter(Boolean)
      .map((part) => part[0].toUpperCase())
      .slice(0, 2)
      .join('');
  }

  function renderLoggedOut() {
    container.innerHTML = `
      <a href="login.html" class="auth-widget-trigger" id="auth-widget-trigger">
        <span class="auth-widget-icon">👤</span>
        <span class="auth-widget-label">Login / Sign Up</span>
      </a>
    `;
  }

  function renderLoggedIn(user) {
    container.innerHTML = `
      <div class="auth-widget-wrapper">
        <button type="button" class="auth-widget-trigger" id="auth-widget-trigger">
          <span class="auth-widget-avatar">${getInitials(user.fullName)}</span>
          <span class="auth-widget-label">${user.fullName}</span>
        </button>
        <div class="auth-widget-dropdown hidden" id="auth-widget-dropdown">
          <p class="auth-widget-dropdown-name">${user.fullName}</p>
          <p class="auth-widget-dropdown-meta">${user.idOrInitials} &middot; ${user.role}${user.isAdmin ? ' (admin)' : ''}</p>
          <a href="account.html" class="btn auth-widget-settings">⚙️ Account Settings</a>
          <button type="button" class="btn auth-widget-signout" id="auth-widget-signout">Sign Out</button>
        </div>
      </div>
    `;

    const trigger = document.getElementById('auth-widget-trigger');
    const dropdown = document.getElementById('auth-widget-dropdown');
    const signOutBtn = document.getElementById('auth-widget-signout');

    trigger.addEventListener('click', (event) => {
      event.stopPropagation();
      dropdown.classList.toggle('hidden');
    });

    signOutBtn.addEventListener('click', () => {
      account.logOut();
      render(); // re-render this widget back to the logged-out state
      // Notify the rest of the page, in case it cares (e.g.
      // contact-page.js needs to know to show the full form again).
      window.dispatchEvent(new CustomEvent('auth-state-changed'));
    });

    // Clicking anywhere outside the dropdown closes it.
    document.addEventListener('click', (event) => {
      if (!container.contains(event.target)) {
        dropdown.classList.add('hidden');
      }
    });
  }

  function render() {
    if (account.isLoggedIn()) {
      renderLoggedIn(account.getCurrentUser());
    } else {
      renderLoggedOut();
    }
  }

  render();
});