/* global Notyf, UserAccount, UserValidationError */

// ==========================================
// FORGOT PASSWORD PAGE CONTROLLER
// ==========================================
// Wires the two-step recovery flow in forgot-password.html to
// the UserAccount class's recovery methods from auth.js:
//   Step 1: getSecurityQuestionForRecovery({ idOrEmail })
//   Step 2: resetPasswordWithSecurityAnswer(lookupData, resetData)
//
// The idOrEmail from step 1 is kept in memory (currentLookup)
// and reused for step 2, so the user only has to type it once.

window.addEventListener('DOMContentLoaded', async () => {
  const account = new UserAccount();
  await account.seedDemoAccountsIfEmpty();

  const stepLookup = document.getElementById('step-lookup');
  const stepReset = document.getElementById('step-reset');
  const stepSuccess = document.getElementById('step-success');

  const lookupForm = document.getElementById('lookup-form');
  const resetForm = document.getElementById('reset-form');
  const startOverLink = document.getElementById('start-over-link');
  const recoveredQuestionText = document.getElementById('recovered-question-text');
  const errorMessageEl = document.getElementById('recovery-error-message');

  const notyf = typeof Notyf !== 'undefined'
    ? new Notyf({ duration: 2500, position: { x: 'right', y: 'bottom' }, ripple: false })
    : null;

  // Holds the identifier from step 1, reused in step 2 - NOT
  // stored anywhere persistent, just kept in memory for this
  // page visit.
  let currentLookup = null;

  function showStep(step) {
    stepLookup.style.display = step === 'lookup' ? 'block' : 'none';
    stepReset.style.display = step === 'reset' ? 'block' : 'none';
    stepSuccess.style.display = step === 'success' ? 'block' : 'none';
  }

  function showError(message) {
  const textEl = errorMessageEl.querySelector('.auth-error-banner-text');
  textEl.textContent = message;
  errorMessageEl.classList.add('visible');
  errorMessageEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

function clearError() {
  errorMessageEl.classList.remove('visible');
  const textEl = errorMessageEl.querySelector('.auth-error-banner-text');
  textEl.textContent = '';
}

  // ---- Step 1: look up the account's security question ----
  lookupForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    clearError();

    const idOrEmail = document.getElementById('lookup-id-email').value;

    try {
      const question = await account.getSecurityQuestionForRecovery({ idOrEmail });
      currentLookup = { idOrEmail };
      recoveredQuestionText.textContent = question;
      showStep('reset');
    } catch (error) {
      if (error instanceof UserValidationError) {
        showError(error.message);
      } else {
        showError('Something went wrong while looking up your account. Please try again.');
        console.error(error);
      }
    }
  });

  // ---- Step 2: answer the question and set a new password ----
  resetForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    clearError();

    if (!currentLookup) {
      // Defensive guard - shouldn't be reachable through normal
      // use since step-reset is hidden until step 1 succeeds, but
      // avoids a confusing crash if it ever is.
      showError('Please start by entering your ID or email again.');
      showStep('lookup');
      return;
    }

    const securityAnswer = document.getElementById('reset-answer').value;
    const newPassword = document.getElementById('reset-new-password').value;
    const confirmNewPassword = document.getElementById('reset-confirm-password').value;

    try {
      await account.resetPasswordWithSecurityAnswer(currentLookup, {
        securityAnswer,
        newPassword,
        confirmNewPassword
      });
      if (notyf) notyf.success('Password reset successfully.');
      showStep('success');
    } catch (error) {
      if (error instanceof UserValidationError) {
        showError(error.message);
      } else {
        showError('Something went wrong while resetting your password. Please try again.');
        console.error(error);
      }
    }
  });

  // ---- Start over link ----
  startOverLink.addEventListener('click', (event) => {
    event.preventDefault();
    currentLookup = null;
    lookupForm.reset();
    resetForm.reset();
    clearError();
    showStep('lookup');
  });

  showStep('lookup');
});
// ==========================================
// PASSWORD VISIBILITY TOGGLE
// ==========================================
// Lets users check what they've actually typed before submitting,
// rather than guessing why a signup was rejected. Works for any
// number of password fields on the page via data-target.
document.querySelectorAll('.password-toggle-btn').forEach((toggleBtn) => {
  toggleBtn.addEventListener('click', () => {
    const targetInput = document.getElementById(toggleBtn.dataset.target);
    if (!targetInput) return;

    const isHidden = targetInput.type === 'password';
    targetInput.type = isHidden ? 'text' : 'password';
    toggleBtn.textContent = isHidden ? '🙈' : '👁️';
  });
});
// ==========================================
// PASSWORD VISIBILITY TOGGLE
// ==========================================
// Lets users check what they've actually typed before submitting,
// rather than guessing why a signup was rejected. Works for any
// number of password fields on the page via data-target.
document.querySelectorAll('.password-toggle-btn').forEach((toggleBtn) => {
  toggleBtn.addEventListener('click', () => {
    const targetInput = document.getElementById(toggleBtn.dataset.target);
    if (!targetInput) return;

    const isHidden = targetInput.type === 'password';
    targetInput.type = isHidden ? 'text' : 'password';
    toggleBtn.textContent = isHidden ? '🙈' : '👁️';
  });
});