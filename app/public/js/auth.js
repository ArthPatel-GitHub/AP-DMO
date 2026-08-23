/* global createUserSignupRequest, createLoginRequest, UserValidationError */

// ==========================================
// AUTHENTICATION: PASSWORD HASHING + UserAccount CLASS
// ==========================================
// SCOPE NOTE: accounts created here are stored ONLY in this
// browser's own localStorage. There is no server, so there is no
// shared list of real students anywhere - each browser only ever
// knows about whoever signed up on that browser, plus the
// fictional demo accounts seeded below. This is a working
// demonstration of the signup/login pattern, not a system meant
// to hold real students' personal details.

const STORAGE_KEY_USERS = 'rathkeale_users';
const STORAGE_KEY_SESSION = 'rathkeale_session';

// ==========================================
// 1. PASSWORD HASHING
// ==========================================
// A real production system would use a dedicated library (e.g.
// bcrypt) on a server. This is a client-only demo, so we use the
// browser's built-in SubtleCrypto API to produce a genuine SHA-256
// hash - passwords are never stored in plain text, even though
// this is a simplified approach worth naming as a deliberate
// simplification rather than production-grade security.
//
// A "salt" (a random value mixed in before hashing) is added per
// user so two identical passwords don't produce identical hashes.

async function hashPassword(plainTextPassword, salt) {
  const encoder = new TextEncoder();
  const data = encoder.encode(salt + plainTextPassword);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

function generateSalt() {
  const array = new Uint8Array(16);
  crypto.getRandomValues(array);
  return Array.from(array).map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

// ==========================================
// 2. UserAccount CLASS
// ==========================================

class UserAccount {
  constructor() {
    this.currentUser = null; // set on successful login, cleared on logout
    this._loadSession();
  }

  // ---- Persistence helpers ----

  _loadAllUsers() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY_USERS);
      return raw ? JSON.parse(raw) : [];
    } catch (error) {
      console.warn('Could not read stored users, starting fresh.', error);
      return [];
    }
  }

  _saveAllUsers(usersArray) {
    localStorage.setItem(STORAGE_KEY_USERS, JSON.stringify(usersArray));
  }

  _loadSession() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY_SESSION);
      this.currentUser = raw ? JSON.parse(raw) : null;
    } catch (error) {
      this.currentUser = null;
    }
  }

  _saveSession(user) {
    localStorage.setItem(STORAGE_KEY_SESSION, JSON.stringify(user));
    this.currentUser = user;
  }

  _clearSession() {
    localStorage.removeItem(STORAGE_KEY_SESSION);
    this.currentUser = null;
  }

  // ---- Public API ----

  /**
   * Registers a new account.
   * @param {object} rawSignupData - { fullName, idOrInitials, email, password, securityQuestion, securityAnswer }
   * @returns {Promise<object>} the public-safe user record (no password)
   */
  async signUp(rawSignupData) {
    const validated = window.createUserSignupRequest(rawSignupData);
    const allUsers = this._loadAllUsers();

    const alreadyExists = allUsers.some(
      (user) => user.idOrInitials === validated.idOrInitials || user.email === validated.email
    );
    if (alreadyExists) {
      throw new window.UserValidationError(
        'An account with that ID or email already exists.',
        'idOrInitials'
      );
    }

    const salt = generateSalt();
    const passwordHash = await hashPassword(validated.password, salt);

    // The security answer is hashed the same way a password is -
    // own salt, never stored as plain text - so even someone with
    // direct access to localStorage can't just read it off.
    const securityAnswerSalt = generateSalt();
    const securityAnswerHash = await hashPassword(validated.securityAnswer, securityAnswerSalt);

    const newUser = {
      fullName: validated.fullName,
      idOrInitials: validated.idOrInitials,
      email: validated.email,
      role: validated.role,
      isAdmin: false, // demo accounts only become admin via _seedDemoAccounts
      salt,
      passwordHash,
      securityQuestion: validated.securityQuestion,
      securityAnswerSalt,
      securityAnswerHash
    };

    allUsers.push(newUser);
    this._saveAllUsers(allUsers);

    return this._toPublicUser(newUser);
  }

  /**
   * Attempts to log in with either a Student ID/Staff Initials
   * OR an email, plus a password.
   * @param {object} rawLoginData - { idOrEmail, password }
   * @returns {Promise<object>} the public-safe user record (no password)
   */
  async logIn(rawLoginData) {
    const validated = window.createLoginRequest(rawLoginData);
    const allUsers = this._loadAllUsers();

    const matchedUser = allUsers.find(
      (user) =>
        user.idOrInitials.toLowerCase() === validated.idOrEmail ||
        user.email === validated.idOrEmail
    );

    if (!matchedUser) {
      throw new window.UserValidationError('No account found with that ID or email.', 'idOrEmail');
    }

    const attemptedHash = await hashPassword(validated.password, matchedUser.salt);
    if (attemptedHash !== matchedUser.passwordHash) {
      throw new window.UserValidationError('Incorrect password.', 'password');
    }

    const publicUser = this._toPublicUser(matchedUser);
    this._saveSession(publicUser);
    return publicUser;
  }

  logOut() {
    this._clearSession();
  }

  /**
   * Changes the currently logged-in user's email address.
   * @param {object} rawData - { newEmail }
   * @returns {Promise<object>} the updated public-safe user record
   */
  async changeEmail(rawData) {
    if (!this.isLoggedIn()) {
      throw new window.UserValidationError('You must be logged in to change your email.');
    }

    const validated = window.createChangeEmailRequest(rawData);
    const allUsers = this._loadAllUsers();
    const currentUser = this.getCurrentUser();

    const emailTakenByAnotherAccount = allUsers.some(
      (user) => user.email === validated.newEmail && user.idOrInitials !== currentUser.idOrInitials
    );
    if (emailTakenByAnotherAccount) {
      throw new window.UserValidationError('That email is already in use by another account.', 'newEmail');
    }

    const userIndex = allUsers.findIndex((user) => user.idOrInitials === currentUser.idOrInitials);
    if (userIndex === -1) {
      throw new window.UserValidationError('Your account could not be found.');
    }

    allUsers[userIndex].email = validated.newEmail;
    this._saveAllUsers(allUsers);

    const updatedPublicUser = this._toPublicUser(allUsers[userIndex]);
    this._saveSession(updatedPublicUser); // keep the active session in sync with the new email
    return updatedPublicUser;
  }

  /**
   * Changes the currently logged-in user's password. Requires
   * the correct current password to succeed.
   * @param {object} rawData - { currentPassword, newPassword, confirmNewPassword }
   */
  async changePassword(rawData) {
    if (!this.isLoggedIn()) {
      throw new window.UserValidationError('You must be logged in to change your password.');
    }

    const validated = window.createChangePasswordRequest(rawData);
    const allUsers = this._loadAllUsers();
    const currentUser = this.getCurrentUser();

    const userIndex = allUsers.findIndex((user) => user.idOrInitials === currentUser.idOrInitials);
    if (userIndex === -1) {
      throw new window.UserValidationError('Your account could not be found.');
    }

    const storedUser = allUsers[userIndex];
    const attemptedCurrentHash = await hashPassword(validated.currentPassword, storedUser.salt);
    if (attemptedCurrentHash !== storedUser.passwordHash) {
      throw new window.UserValidationError('Current password is incorrect.', 'currentPassword');
    }

    const newSalt = generateSalt(); // fresh salt on every password change, not just every signup
    storedUser.salt = newSalt;
    storedUser.passwordHash = await hashPassword(validated.newPassword, newSalt);

    this._saveAllUsers(allUsers);
    return this._toPublicUser(storedUser);
  }

  // ---- Account recovery (security question) ----

  /**
   * Step 1 of recovery: looks up an account by ID or email and
   * returns its security question, WITHOUT revealing anything
   * else about the account (no name, no confirmation either way
   * beyond "found" vs "not found" - kept deliberately minimal).
   * @param {object} rawData - { idOrEmail }
   * @returns {Promise<string>} the account's security question
   */
  async getSecurityQuestionForRecovery(rawData) {
    const validated = window.createRecoveryLookupRequest(rawData);
    const allUsers = this._loadAllUsers();

    const matchedUser = allUsers.find(
      (user) =>
        user.idOrInitials.toLowerCase() === validated.idOrEmail ||
        user.email === validated.idOrEmail
    );

    if (!matchedUser) {
      throw new window.UserValidationError('No account found with that ID or email.', 'idOrEmail');
    }

    return matchedUser.securityQuestion;
  }

  /**
   * Step 2 of recovery: verifies the security answer for the
   * account looked up in step 1, and if correct, sets a new
   * password.
   * @param {object} lookupData - { idOrEmail } (same as step 1)
   * @param {object} resetData - { securityAnswer, newPassword, confirmNewPassword }
   */
  async resetPasswordWithSecurityAnswer(lookupData, resetData) {
    const validatedLookup = window.createRecoveryLookupRequest(lookupData);
    const validatedReset = window.createRecoveryResetRequest(resetData);
    const allUsers = this._loadAllUsers();

    const userIndex = allUsers.findIndex(
      (user) =>
        user.idOrInitials.toLowerCase() === validatedLookup.idOrEmail ||
        user.email === validatedLookup.idOrEmail
    );

    if (userIndex === -1) {
      throw new window.UserValidationError('No account found with that ID or email.', 'idOrEmail');
    }

    const storedUser = allUsers[userIndex];
    const attemptedAnswerHash = await hashPassword(validatedReset.securityAnswer, storedUser.securityAnswerSalt);
    if (attemptedAnswerHash !== storedUser.securityAnswerHash) {
      throw new window.UserValidationError('That answer does not match.', 'securityAnswer');
    }

    const newSalt = generateSalt();
    storedUser.salt = newSalt;
    storedUser.passwordHash = await hashPassword(validatedReset.newPassword, newSalt);

    this._saveAllUsers(allUsers);
    return true;
  }

  // ---- Favourites ----

  /**
   * Toggles whether a song is in the logged-in user's favourites
   * list. Adds it if absent, removes it if present.
   * @param {string} songId
   * @returns {boolean} true if the song is now favourited, false if it was just removed
   */
  toggleFavourite(songId) {
    if (!this.isLoggedIn()) {
      throw new window.UserValidationError('You must be logged in to save favourites.');
    }
    if (typeof songId !== 'string' || songId.length === 0) {
      throw new window.UserValidationError('A valid song id is required.');
    }

    const allUsers = this._loadAllUsers();
    const currentUser = this.getCurrentUser();
    const userIndex = allUsers.findIndex((user) => user.idOrInitials === currentUser.idOrInitials);
    if (userIndex === -1) {
      throw new window.UserValidationError('Your account could not be found.');
    }

    // Older accounts (created before this feature existed) won't
    // have a favourites array yet - default to an empty one
    // rather than crashing on undefined.
    if (!Array.isArray(allUsers[userIndex].favourites)) {
      allUsers[userIndex].favourites = [];
    }

    const favourites = allUsers[userIndex].favourites;
    const existingIndex = favourites.indexOf(songId);
    let nowFavourited;

    if (existingIndex === -1) {
      favourites.push(songId);
      nowFavourited = true;
    } else {
      favourites.splice(existingIndex, 1);
      nowFavourited = false;
    }

    this._saveAllUsers(allUsers);

    // Keep the active session's copy in sync too, since
    // getFavourites()/isFavourited() read from getCurrentUser(),
    // not directly from allUsers.
    const updatedPublicUser = this._toPublicUser(allUsers[userIndex]);
    this._saveSession(updatedPublicUser);

    return nowFavourited;
  }

  /**
   * Returns the logged-in user's list of favourited song ids.
   * Returns an empty array if logged out, rather than throwing -
   * this is a read-only convenience method that UI code can call
   * freely without needing to check login state first every time.
   * @returns {Array<string>}
   */
  getFavourites() {
    const user = this.getCurrentUser();
    if (!user) return [];
    return Array.isArray(user.favourites) ? user.favourites : [];
  }

  /**
   * Convenience check for whether a specific song is favourited
   * by the logged-in user.
   * @param {string} songId
   * @returns {boolean}
   */
  isFavourited(songId) {
    return this.getFavourites().includes(songId);
  }

  /**
   * Always reads the session fresh from localStorage rather than
   * a cached instance field. This matters because a page can have
   * MORE THAN ONE UserAccount instance alive at once (e.g. the
   * nav auth-widget and a page-specific controller both create
   * their own instance) - if login state were only cached on
   * construction, one instance logging in/out would leave the
   * other silently out of date.
   */
  getCurrentUser() {
    this._loadSession();
    return this.currentUser;
  }

  isLoggedIn() {
    return this.getCurrentUser() !== null;
  }

  /**
   * Returns every signed-up user, WITHOUT password hashes or
   * salts - only safe to call from admin-gated UI, but the method
   * itself never leaks sensitive fields regardless of caller.
   */
  getAllUsersPublic() {
    return this._loadAllUsers().map((user) => this._toPublicUser(user));
  }

  // Strips password/salt before returning a user object to any
  // caller - this is the ONE place that decides what's "public"
  // about a user, so we don't accidentally leak hashes elsewhere.
  _toPublicUser(user) {
    return {
      fullName: user.fullName,
      idOrInitials: user.idOrInitials,
      email: user.email,
      role: user.role,
      isAdmin: user.isAdmin,
      // Defaults to an empty array for accounts created before
      // this field existed, rather than leaking `undefined`.
      favourites: Array.isArray(user.favourites) ? user.favourites : []
    };
  }

  // ---- Demo seeding ----

  /**
   * Creates two fictional demo accounts the first time the app
   * runs, IF no accounts exist yet. Lets the app be demoed
   * immediately without needing to sign up first.
   */
  async seedDemoAccountsIfEmpty() {
    const allUsers = this._loadAllUsers();
    if (allUsers.length > 0) return; // already seeded, or real accounts exist

    const studentSalt = generateSalt();
    const staffSalt = generateSalt();
    const studentAnswerSalt = generateSalt();
    const staffAnswerSalt = generateSalt();

    const demoStudent = {
      fullName: 'Alex Test',
      idOrInitials: '123456',
      email: 'alex.test@example.com',
      role: 'student',
      isAdmin: false,
      salt: studentSalt,
      passwordHash: await hashPassword('Demo123!', studentSalt),
      securityQuestion: window.SECURITY_QUESTIONS[0],
      securityAnswerSalt: studentAnswerSalt,
      securityAnswerHash: await hashPassword('rex', studentAnswerSalt) // documented demo answer
    };

    const demoStaff = {
      fullName: 'J. Sample',
      idOrInitials: 'JSM',
      email: 'j.sample@example.com',
      role: 'staff',
      isAdmin: true,
      salt: staffSalt,
      passwordHash: await hashPassword('Demo123!', staffSalt),
      securityQuestion: window.SECURITY_QUESTIONS[1],
      securityAnswerSalt: staffAnswerSalt,
      securityAnswerHash: await hashPassword('smith', staffAnswerSalt) // documented demo answer
    };

    this._saveAllUsers([demoStudent, demoStaff]);
  }

  /**
   * Wipes ALL stored accounts and the active session, then
   * re-seeds the two fictional demo accounts fresh. This is the
   * one deliberate, explicit way to clear out any accounts that
   * were created under an older data shape (e.g. signed up before
   * the security question feature existed, and so are missing
   * those fields) - rather than trying to patch old records, this
   * guarantees every account going forward matches the current
   * shape exactly.
   *
   * Intentionally destructive and intentionally manual - this
   * should only ever be triggered by an explicit user action (a
   * confirmed button click), never automatically.
   */
  async resetAllData() {
    localStorage.removeItem(STORAGE_KEY_USERS);
    this._clearSession();
    await this.seedDemoAccountsIfEmpty();
  }
}

window.UserAccount = UserAccount;
window.hashPassword = hashPassword; // exposed for testing
window.generateSalt = generateSalt; // exposed for testing