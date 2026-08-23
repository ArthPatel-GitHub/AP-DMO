/* global Notyf, UserAccount, UserValidationError */

// ==========================================
// ACCOUNT SETTINGS PAGE CONTROLLER
// ==========================================
// Wires the forms in account.html to the UserAccount class
// methods already built and tested in auth.js:
//   - changeEmail()
//   - changePassword()
//   - logOut()
//
// If the user is not logged in, this page shows a "not signed
// in" state and links them back to login.html rather than
// showing broken forms.

window.addEventListener('DOMContentLoaded', () => {
  const account = new UserAccount();

  const guestState = document.getElementById('guest-state');
  const settingsState = document.getElementById('settings-state');
  const accountIdentity = document.getElementById('account-identity');
  const signoutBtn = document.getElementById('signout-btn');

  const changeEmailForm = document.getElementById('change-email-form');
  const changePasswordForm = document.getElementById('change-password-form');
  const emailError = document.getElementById('email-error');
  const passwordError = document.getElementById('password-error');

  const notyf = typeof Notyf !== 'undefined'
    ? new Notyf({ duration: 2500, position: { x: 'right', y: 'bottom' }, ripple: false })
    : null;

  // ---- Render correct state ----
  if (!account.isLoggedIn()) {
    guestState.style.display = 'block';
    return; // nothing else to wire up for a guest
  }

  settingsState.style.display = 'block';
  const user = account.getCurrentUser();
  accountIdentity.textContent = `${user.fullName} (${user.idOrInitials} · ${user.role}${user.isAdmin ? ' · admin' : ''})`;

  // ---- Helper: show/clear field-specific errors ----
  function showError(el, message) {
    el.textContent = message;
    el.style.display = 'block';
  }

  function clearError(el) {
    el.textContent = '';
    el.style.display = 'none';
  }

  // ---- Change Email ----
  changeEmailForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    clearError(emailError);

    const newEmail = document.getElementById('new-email').value;

    try {
      const updatedUser = await account.changeEmail({ newEmail });
      if (notyf) notyf.success(`Email updated to ${updatedUser.email}`);
      changeEmailForm.reset();
      // Update the identity card to reflect the new email
      accountIdentity.textContent = `${updatedUser.fullName} (${updatedUser.idOrInitials} · ${updatedUser.role}${updatedUser.isAdmin ? ' · admin' : ''})`;
    } catch (error) {
      if (error instanceof UserValidationError) {
        showError(emailError, error.message);
      } else {
        showError(emailError, 'Something went wrong. Please try again.');
        console.error(error);
      }
    }
  });

  // ---- Change Password ----
  changePasswordForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    clearError(passwordError);

    const currentPassword = document.getElementById('current-password').value;
    const newPassword = document.getElementById('new-password').value;
    const confirmNewPassword = document.getElementById('confirm-new-password').value;

    try {
      await account.changePassword({ currentPassword, newPassword, confirmNewPassword });
      if (notyf) notyf.success('Password updated successfully.');
      changePasswordForm.reset();
    } catch (error) {
      if (error instanceof UserValidationError) {
        showError(passwordError, error.message);
      } else {
        showError(passwordError, 'Something went wrong. Please try again.');
        console.error(error);
      }
    }
  });

  // ---- Sign Out ----
  signoutBtn.addEventListener('click', () => {
    account.logOut();
    window.dispatchEvent(new CustomEvent('auth-state-changed'));
    window.location.href = 'index.html';
  });

  // If sign-out happens via the nav widget while on this page,
  // flip to the guest state immediately.
  window.addEventListener('auth-state-changed', () => {
    if (!account.isLoggedIn()) {
      settingsState.style.display = 'none';
      guestState.style.display = 'block';
    }
  });
});