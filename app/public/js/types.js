/* global */

// ==========================================
// STUDENT-DEFINED TYPES
// ==========================================
// This file defines the "shape" of the data our app works with,
// and validates raw data against that shape before anything else
// in the app is allowed to use it.
//
// Why this exists: previously, songsDatabase = data; just trusted
// whatever came out of database.json. If a song entry was missing
// a field (e.g. someone forgot "audioUrl" when adding a new hymn),
// the bug wouldn't show up until a student clicked that song and
// the player silently broke. Validating on load catches that
// immediately, with a clear error pointing at exactly which song
// and which field is the problem.

// ==========================================
// 1. CUSTOM ERROR TYPE
// ==========================================
// A dedicated error type so calling code can tell "this song's
// data is broken" apart from other kinds of errors (network
// failures, etc.) if it ever needs to handle them differently.
class SongValidationError extends Error {
  constructor(message, songId) {
    super(message);
    this.name = 'SongValidationError';
    this.songId = songId;
  }
}

// ==========================================
// 2. THE Song TYPE
// ==========================================
// Describes every field a valid song object must have, and what
// type/shape that field must be in.
const SONG_SCHEMA = {
  id: 'string',
  title: 'string',
  lyrics: 'string',
  history: 'string',
  audioUrl: 'string',
  type: 'string',
  durationInSeconds: 'number'
};

const VALID_SONG_TYPES = ['hymn', 'anthem'];

/**
 * Validates a raw song object (e.g. one entry from database.json)
 * and returns a clean, validated Song object.
 *
 * Throws SongValidationError if the data doesn't match the
 * expected shape, instead of letting bad data through silently.
 *
 * @param {object} rawData - one untrusted object from the JSON file
 * @returns {object} a validated Song object
 */
function createSong(rawData) {
  if (!rawData || typeof rawData !== 'object') {
    throw new SongValidationError(
      'Song entry is not a valid object.',
      rawData ? rawData.id : undefined
    );
  }

  const fallbackId = rawData.id || '(unknown id)';

  // Check every required field exists and is the correct type
  for (const fieldName in SONG_SCHEMA) {
    const expectedType = SONG_SCHEMA[fieldName];
    const actualValue = rawData[fieldName];

    if (actualValue === undefined || actualValue === null) {
      throw new SongValidationError(
        `Song "${fallbackId}" is missing required field "${fieldName}".`,
        fallbackId
      );
    }

    if (typeof actualValue !== expectedType) {
      throw new SongValidationError(
        `Song "${fallbackId}" field "${fieldName}" should be a ${expectedType}, ` +
        `but got ${typeof actualValue}.`,
        fallbackId
      );
    }
  }

  // Extra checks beyond just "right type" - the value also has to make sense
  if (rawData.title.trim().length === 0) {
    throw new SongValidationError(
      `Song "${fallbackId}" has an empty title.`,
      fallbackId
    );
  }

  if (rawData.audioUrl.trim().length === 0) {
    throw new SongValidationError(
      `Song "${fallbackId}" has an empty audioUrl.`,
      fallbackId
    );
  }

  if (rawData.durationInSeconds <= 0) {
    throw new SongValidationError(
      `Song "${fallbackId}" has an invalid durationInSeconds (${rawData.durationInSeconds}). ` +
      `Must be a positive number.`,
      fallbackId
    );
  }

  if (!VALID_SONG_TYPES.includes(rawData.type.toLowerCase())) {
    throw new SongValidationError(
      `Song "${fallbackId}" has an unrecognised type "${rawData.type}". ` +
      `Expected one of: ${VALID_SONG_TYPES.join(', ')}.`,
      fallbackId
    );
  }

  // Data is valid - return a clean, predictable Song object.
  // We rebuild the object explicitly (rather than just returning
  // rawData) so we know exactly what shape it is downstream, and
  // any unexpected extra junk fields in the JSON get dropped.
  return {
    id: rawData.id,
    title: rawData.title,
    lyrics: rawData.lyrics,
    history: rawData.history,
    audioUrl: rawData.audioUrl,
    type: rawData.type.toLowerCase(),
    durationInSeconds: rawData.durationInSeconds
  };
}

/**
 * Validates an entire array of raw song data (e.g. the full
 * database.json file). Invalid entries are skipped (with a
 * console warning) rather than crashing the whole app, so one
 * broken entry doesn't take down the entire song catalogue.
 *
 * @param {Array} rawSongsArray
 * @returns {Array} array of validated Song objects
 */
function createSongDatabase(rawSongsArray) {
  if (!Array.isArray(rawSongsArray)) {
    throw new SongValidationError('Song database is not an array.');
  }

  const validatedSongs = [];

  rawSongsArray.forEach((rawSong, index) => {
    try {
      validatedSongs.push(createSong(rawSong));
    } catch (error) {
      // Skip the broken entry, but make noise about it so it
      // gets noticed and fixed in the JSON file - we don't want
      // it failing silently either.
      console.warn(
        `Skipping invalid song at index ${index}: ${error.message}`
      );
    }
  });

  return validatedSongs;
}

// ==========================================
// 3. THE PlaybackState TYPE
// ==========================================
// Describes the shape of "what is currently going on" in the
// player - the current song, whether shuffle/repeat are on, and
// what order songs should play in. This used to be scattered
// across separate global variables; giving it one defined shape
// is what the MusicPlayer class (next step) will be built around.

const REPEAT_MODES = ['off', 'one', 'all'];

/**
 * Creates a fresh, valid PlaybackState object with sensible
 * defaults. Call this once when the player starts up.
 *
 * @returns {object} a new PlaybackState object
 */
function createPlaybackState() {
  return {
    currentSongId: null,
    isShuffleOn: false,
    repeatMode: 'off',       // one of REPEAT_MODES
    historyStack: [],        // existing stack behaviour, now typed
    shuffleQueue: []         // upcoming songs in shuffled order
  };
}

/**
 * Validates that a repeat mode value is one we actually support,
 * before it's allowed to be set on a PlaybackState.
 *
 * @param {string} mode
 * @returns {boolean}
 */
function isValidRepeatMode(mode) {
  return REPEAT_MODES.includes(mode);
}

// ==========================================
// 4. THE User TYPE
// ==========================================
// Describes a valid signup/login submission. Same idea as Song:
// check the shape and contents are sensible BEFORE any of it is
// trusted by the rest of the app (UserAccount class, storage, etc).
//
// NOTE ON SCOPE: this app only ever stores accounts in the
// current browser's own localStorage (see auth.js). There is no
// shared server, so this is a self-contained demo of the
// signup/login pattern using fictional seeded accounts, not a
// system that collects or holds real students' personal details.

class UserValidationError extends Error {
  constructor(message, field) {
    super(message);
    this.name = 'UserValidationError';
    this.field = field;
  }
}

// Matches the same identification pattern already used in
// contact.html: a 6-8 digit student ID, or 3 letter staff initials.
const ID_PATTERN = /^(\d{6,8}|[A-Za-z]{3})$/;

// A reasonably standard "looks like an email" check. Not aiming
// to catch every edge case RFC 5322 allows, just obviously wrong input.
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const MIN_PASSWORD_LENGTH = 8;
const MAX_PASSWORD_LENGTH = 32;
const MAX_FULL_NAME_LENGTH = 60;
const MAX_ID_LENGTH = 8; // already implied by ID_PATTERN (6-8 digits or 3 letters), stated explicitly here for clarity
const MAX_EMAIL_LENGTH = 100;
const MAX_SECURITY_ANSWER_LENGTH = 50;

// Password must contain at least one of each: uppercase letter,
// lowercase letter, digit, and a "special" (non-alphanumeric)
// character. Checked as four separate regexes rather than one
// dense pattern, so a failure can point at exactly which
// requirement is missing instead of a vague "invalid password".
const PASSWORD_HAS_UPPERCASE = /[A-Z]/;
const PASSWORD_HAS_LOWERCASE = /[a-z]/;
const PASSWORD_HAS_NUMBER = /[0-9]/;
const PASSWORD_HAS_SPECIAL_CHAR = /[^A-Za-z0-9]/;

/**
 * Checks a password meets the length and complexity rules. Used
 * by both signup and password-change/reset flows, so the rule is
 * defined once and applied everywhere consistently.
 *
 * Throws UserValidationError with a specific message naming
 * exactly which requirement failed, rather than one generic
 * "weak password" message.
 *
 * @param {string} password
 * @param {string} fieldName - used in the thrown error's `field` property
 */
function validatePasswordComplexity(password, fieldName) {
  if (typeof password !== 'string' || password.length < MIN_PASSWORD_LENGTH) {
    throw new UserValidationError(
      `Password must be at least ${MIN_PASSWORD_LENGTH} characters long.`,
      fieldName
    );
  }
  if (password.length > MAX_PASSWORD_LENGTH) {
    throw new UserValidationError(
      `Password must be no more than ${MAX_PASSWORD_LENGTH} characters long.`,
      fieldName
    );
  }
  if (!PASSWORD_HAS_UPPERCASE.test(password)) {
    throw new UserValidationError('Password must include at least one uppercase letter.', fieldName);
  }
  if (!PASSWORD_HAS_LOWERCASE.test(password)) {
    throw new UserValidationError('Password must include at least one lowercase letter.', fieldName);
  }
  if (!PASSWORD_HAS_NUMBER.test(password)) {
    throw new UserValidationError('Password must include at least one number.', fieldName);
  }
  if (!PASSWORD_HAS_SPECIAL_CHAR.test(password)) {
    throw new UserValidationError('Password must include at least one special character (e.g. ! @ # $ %).', fieldName);
  }
}

// A fixed list of standard security questions to choose from -
// constraining to a list (rather than a free-text question) means
// we can show the SAME question back at recovery time without
// needing to separately store the chosen question text per user
// beyond a simple reference.
const SECURITY_QUESTIONS = [
  "What was the name of your first pet?",
  "What is your mother's maiden name?",
  "What was the name of your primary school?",
  "What is your favourite book?",
  "What city were you born in?"
];

/**
 * Validates a raw signup submission (name, id, email, password,
 * security question + answer) and returns a clean, validated
 * object ready to be turned into a stored account by the
 * UserAccount class.
 *
 * Throws UserValidationError with a field-specific message if
 * anything is wrong, so the signup form can show the user exactly
 * what to fix.
 *
 * @param {object} rawData - { fullName, idOrInitials, email, password, securityQuestion, securityAnswer }
 * @returns {object} a validated signup object
 */
function createUserSignupRequest(rawData) {
  if (!rawData || typeof rawData !== 'object') {
    throw new UserValidationError('Signup data is not a valid object.');
  }

  const { fullName, idOrInitials, email, password, securityQuestion, securityAnswer } = rawData;

  if (typeof fullName !== 'string' || fullName.trim().length === 0) {
    throw new UserValidationError('Full name is required.', 'fullName');
  }
  if (fullName.trim().length > MAX_FULL_NAME_LENGTH) {
    throw new UserValidationError(`Full name must be ${MAX_FULL_NAME_LENGTH} characters or fewer.`, 'fullName');
  }

  if (typeof idOrInitials !== 'string' || !ID_PATTERN.test(idOrInitials.trim())) {
    throw new UserValidationError(
      'ID must be a 6-8 digit Student ID, or 3-letter Staff Initials.',
      'idOrInitials'
    );
  }
  // ID_PATTERN already enforces 6-8 digits or exactly 3 letters,
  // so MAX_ID_LENGTH can never actually be exceeded by a string
  // that passes the pattern above - this check exists anyway as
  // an explicit, defensive guard rather than relying solely on
  // the regex never changing in a way that breaks that guarantee.
  if (idOrInitials.trim().length > MAX_ID_LENGTH) {
    throw new UserValidationError(`ID must be ${MAX_ID_LENGTH} characters or fewer.`, 'idOrInitials');
  }

  if (typeof email !== 'string' || !EMAIL_PATTERN.test(email.trim())) {
    throw new UserValidationError('Please enter a valid email address.', 'email');
  }
  if (email.trim().length > MAX_EMAIL_LENGTH) {
    throw new UserValidationError(`Email must be ${MAX_EMAIL_LENGTH} characters or fewer.`, 'email');
  }

  validatePasswordComplexity(password, 'password');

  if (typeof securityQuestion !== 'string' || !SECURITY_QUESTIONS.includes(securityQuestion)) {
    throw new UserValidationError(
      'Please choose one of the listed security questions.',
      'securityQuestion'
    );
  }

  if (typeof securityAnswer !== 'string' || securityAnswer.trim().length === 0) {
    throw new UserValidationError(
      'A security question answer is required, and cannot be recovered if forgotten.',
      'securityAnswer'
    );
  }
  if (securityAnswer.trim().length > MAX_SECURITY_ANSWER_LENGTH) {
    throw new UserValidationError(`Answer must be ${MAX_SECURITY_ANSWER_LENGTH} characters or fewer.`, 'securityAnswer');
  }

  // Staff vs student is inferred the same way the ID itself is
  // validated: pure letters = staff initials, digits = student ID.
  const isStaffAccount = /^[A-Za-z]{3}$/.test(idOrInitials.trim());

  return {
    fullName: fullName.trim(),
    idOrInitials: idOrInitials.trim(),
    email: email.trim().toLowerCase(),
    password, // not trimmed - a password's whitespace is meaningful
    securityQuestion,
    securityAnswer: securityAnswer.trim().toLowerCase(), // normalised so "Rex" and "rex" both work at recovery time
    role: isStaffAccount ? 'staff' : 'student'
  };
}

/**
 * Validates a login attempt has the minimum shape needed to even
 * attempt a lookup (we don't know yet if the account exists or
 * the password is correct - that's the UserAccount class's job).
 *
 * @param {object} rawData - { idOrEmail, password }
 * @returns {object} a validated login request
 */
function createLoginRequest(rawData) {
  if (!rawData || typeof rawData !== 'object') {
    throw new UserValidationError('Login data is not a valid object.');
  }

  const { idOrEmail, password } = rawData;

  if (typeof idOrEmail !== 'string' || idOrEmail.trim().length === 0) {
    throw new UserValidationError('Student ID, Staff Initials, or email is required.', 'idOrEmail');
  }

  if (typeof password !== 'string' || password.length === 0) {
    throw new UserValidationError('Password is required.', 'password');
  }

  return {
    idOrEmail: idOrEmail.trim().toLowerCase(),
    password
  };
}

/**
 * Validates a request to change the logged-in user's email.
 * @param {object} rawData - { newEmail }
 * @returns {object} a validated change-email request
 */
function createChangeEmailRequest(rawData) {
  if (!rawData || typeof rawData !== 'object') {
    throw new UserValidationError('Change email data is not a valid object.');
  }

  const { newEmail } = rawData;

  if (typeof newEmail !== 'string' || !EMAIL_PATTERN.test(newEmail.trim())) {
    throw new UserValidationError('Please enter a valid email address.', 'newEmail');
  }
  if (newEmail.trim().length > MAX_EMAIL_LENGTH) {
    throw new UserValidationError(`Email must be ${MAX_EMAIL_LENGTH} characters or fewer.`, 'newEmail');
  }

  return { newEmail: newEmail.trim().toLowerCase() };
}

/**
 * Validates a request to change the logged-in user's password.
 * Checks the new password meets the minimum length and that the
 * confirmation matches - it does NOT check the current password
 * is correct, since that requires comparing against the stored
 * hash, which is the UserAccount class's job, not a pure
 * validation concern.
 *
 * @param {object} rawData - { currentPassword, newPassword, confirmNewPassword }
 * @returns {object} a validated change-password request
 */
function createChangePasswordRequest(rawData) {
  if (!rawData || typeof rawData !== 'object') {
    throw new UserValidationError('Change password data is not a valid object.');
  }

  const { currentPassword, newPassword, confirmNewPassword } = rawData;

  if (typeof currentPassword !== 'string' || currentPassword.length === 0) {
    throw new UserValidationError('Current password is required.', 'currentPassword');
  }

  validatePasswordComplexity(newPassword, 'newPassword');

  if (newPassword !== confirmNewPassword) {
    throw new UserValidationError('New password and confirmation do not match.', 'confirmNewPassword');
  }

  if (newPassword === currentPassword) {
    throw new UserValidationError('New password must be different from your current password.', 'newPassword');
  }

  return { currentPassword, newPassword };
}

/**
 * Validates the first step of account recovery: identifying
 * which account the user is trying to recover.
 * @param {object} rawData - { idOrEmail }
 */
function createRecoveryLookupRequest(rawData) {
  if (!rawData || typeof rawData !== 'object') {
    throw new UserValidationError('Recovery data is not a valid object.');
  }

  const { idOrEmail } = rawData;

  if (typeof idOrEmail !== 'string' || idOrEmail.trim().length === 0) {
    throw new UserValidationError('Student ID, Staff Initials, or email is required.', 'idOrEmail');
  }

  return { idOrEmail: idOrEmail.trim().toLowerCase() };
}

/**
 * Validates the second step of account recovery: answering the
 * security question and setting a new password.
 * @param {object} rawData - { securityAnswer, newPassword, confirmNewPassword }
 */
function createRecoveryResetRequest(rawData) {
  if (!rawData || typeof rawData !== 'object') {
    throw new UserValidationError('Recovery reset data is not a valid object.');
  }

  const { securityAnswer, newPassword, confirmNewPassword } = rawData;

  if (typeof securityAnswer !== 'string' || securityAnswer.trim().length === 0) {
    throw new UserValidationError('An answer is required.', 'securityAnswer');
  }
  if (securityAnswer.trim().length > MAX_SECURITY_ANSWER_LENGTH) {
    throw new UserValidationError(`Answer must be ${MAX_SECURITY_ANSWER_LENGTH} characters or fewer.`, 'securityAnswer');
  }

  validatePasswordComplexity(newPassword, 'newPassword');

  if (newPassword !== confirmNewPassword) {
    throw new UserValidationError('New password and confirmation do not match.', 'confirmNewPassword');
  }

  return {
    securityAnswer: securityAnswer.trim().toLowerCase(),
    newPassword
  };
}

// Export everything the rest of the app needs.
// (No module bundler in this project, so these attach to window
// for App.js / player.js to use, the same way the rest of the
// codebase works.)
window.SongValidationError = SongValidationError;
window.createSong = createSong;
window.createSongDatabase = createSongDatabase;
window.createPlaybackState = createPlaybackState;
window.isValidRepeatMode = isValidRepeatMode;
window.REPEAT_MODES = REPEAT_MODES;
window.UserValidationError = UserValidationError;
window.createUserSignupRequest = createUserSignupRequest;
window.createLoginRequest = createLoginRequest;
window.createChangeEmailRequest = createChangeEmailRequest;
window.createChangePasswordRequest = createChangePasswordRequest;
window.createRecoveryLookupRequest = createRecoveryLookupRequest;
window.createRecoveryResetRequest = createRecoveryResetRequest;
window.SECURITY_QUESTIONS = SECURITY_QUESTIONS;
window.validatePasswordComplexity = validatePasswordComplexity;
window.MAX_PASSWORD_LENGTH = MAX_PASSWORD_LENGTH;
window.MAX_FULL_NAME_LENGTH = MAX_FULL_NAME_LENGTH;
window.MAX_ID_LENGTH = MAX_ID_LENGTH;
window.MAX_EMAIL_LENGTH = MAX_EMAIL_LENGTH;
window.MAX_SECURITY_ANSWER_LENGTH = MAX_SECURITY_ANSWER_LENGTH;
window.MAX_SEARCH_LENGTH = 50; // search bar isn't part of signup/login, but shares the same "bounded input" principle