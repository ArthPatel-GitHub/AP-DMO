/* global UserAccount */

// ==========================================
// CONTACT PAGE CONTROLLER
// ==========================================
// Adapts contact.html based on whether a user is logged in:
//   - Logged in: name/ID fields are removed, replaced by a
//     confirmation line, and their account details are submitted
//     automatically via hidden fields.
//   - Logged out: the form behaves exactly as it did before,
//     with an added note that unidentified requests may take
//     longer to action.
//
// NOTE: the logged-in/out fields are REMOVED from the DOM
// (rather than just hidden) to guarantee FormSubmit only ever
// receives one value per field name. That means if the user
// signs out via the nav auth-widget while sitting on this page,
// we can't cleanly "undo" that removal - so we listen for the
// auth-state-changed event the widget fires on sign-out, and
// simply reload the page. A fresh load re-runs this script from
// scratch against the new (logged-out) state, which is simpler
// and more robust than trying to surgically reverse DOM removals.

window.addEventListener('DOMContentLoaded', () => {
  const account = new UserAccount();

  const nameFieldGroup = document.getElementById('name-field-group');
  const idFieldGroup = document.getElementById('id-field-group');
  const userNameInput = document.getElementById('user-name');
  const userIdInput = document.getElementById('user-id');
  const hiddenUserNameInput = document.getElementById('hidden-user-name');
  const hiddenUserIdInput = document.getElementById('hidden-user-id');

  const loggedInNotice = document.getElementById('logged-in-identity-notice');
  const loggedInNoticeText = document.getElementById('logged-in-identity-text');
  const loggedOutNotice = document.getElementById('logged-out-notice');

  const contactForm = document.getElementById('contact-form');

  if (!contactForm) return; // safety guard, same pattern as the rest of the app

  if (account.isLoggedIn()) {
    const user = account.getCurrentUser();

    // Remove the visible name/ID fields entirely (rather than
    // just hiding them) so a logged-in user can't accidentally
    // submit a blank or different value through them.
    nameFieldGroup.remove();
    idFieldGroup.remove();

    // The visible inputs are gone, but each had name="user-name"
    // / name="user-id" - removing them from the DOM means they
    // won't be submitted at all, so the hidden fields (same
    // names) are free to carry the real values through instead.
    hiddenUserNameInput.value = user.fullName;
    hiddenUserIdInput.value = user.idOrInitials;

    loggedInNotice.style.display = 'block';
    loggedInNoticeText.textContent = `${user.fullName} (${user.idOrInitials})`;
  } else {
    // Logged out: keep the original visible fields, but they
    // need to be required again (since the HTML no longer marks
    // them required by default, to avoid blocking the logged-in
    // path where they're removed).
    userNameInput.setAttribute('required', 'required');
    userIdInput.setAttribute('required', 'required');

    // The hidden hidden-name/hidden-id inputs would otherwise
    // submit empty values alongside the real ones under the same
    // field names - remove them so only the visible, filled-in
    // fields are sent.
    hiddenUserNameInput.remove();
    hiddenUserIdInput.remove();

    loggedOutNotice.style.display = 'block';
  }

  // If the user signs out via the nav widget while on this page,
  // reload so the form re-renders cleanly in the logged-out state.
  window.addEventListener('auth-state-changed', () => {
    window.location.reload();
  });

  // Live character counter for the message box, which has a
  // 250-char maxlength on the <textarea> itself - this just gives
  // a visible readout so the limit isn't a silent surprise.
  const messageTextarea = document.getElementById('request-message');
  const charCountEl = document.getElementById('message-char-count');
  if (messageTextarea && charCountEl) {
    const maxLength = messageTextarea.getAttribute('maxlength') || 250;
    const updateCount = () => {
      charCountEl.textContent = `${messageTextarea.value.length} / ${maxLength} characters`;
    };
    messageTextarea.addEventListener('input', updateCount);
    updateCount(); // set the initial 0 / 250 state
  }
});