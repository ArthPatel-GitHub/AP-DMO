/* global createPlaybackState, isValidRepeatMode */

// ==========================================
// OBJECT-ORIENTED PROGRAMMING: MusicPlayer CLASS
// ==========================================
// Before this class existed, playback state lived as separate
// global variables in App.js (currentAudioElement,
// currentActiveSongId, playbackHistoryStack, progressUpdateInterval)
// and a handful of standalone functions all reached into those
// globals directly. That worked fine for a single player page,
// but it has no way to:
//   - persist playback across page navigation (needed for the
//     mini-player), since globals reset every time a new HTML
//     page loads and App.js runs again
//   - support a shuffle queue cleanly, without yet more globals
//     and yet more functions that all have to stay in sync
//
// This class bundles all of that state and behaviour into one
// object. Both the full player page and the mini-player can hold
// a reference to the *same* MusicPlayer instance and call the
// same methods, instead of duplicating logic.
//
// IMPORTANT: this first version is a faithful port. It is meant
// to behave EXACTLY like the existing global-variable version -
// no shuffle, no new features yet. That comes after this is
// tested and confirmed to work the same as before.

class MusicPlayer {
  /**
   * @param {Array} songDatabase - validated Song objects (the
   *   output of createSongDatabase from types.js)
   */
  constructor(songDatabase) {
    if (!Array.isArray(songDatabase)) {
      throw new TypeError('MusicPlayer requires an array of Song objects.');
    }

    this.songDatabase = songDatabase;

    // A Map gives O(1) lookups by id, same reasoning as the
    // existing songCacheMap in App.js.
    this.songCacheMap = new Map();
    songDatabase.forEach((song) => this.songCacheMap.set(song.id, song));

    // Playback state - same shape as createPlaybackState() from
    // types.js, so this class and that type stay consistent.
    this.state = window.createPlaybackState();

    // The actual HTML5 Audio object. Not part of "state" because
    // it's a live browser object, not plain data.
    this.audioElement = null;

    // Interval handle for progress-bar updates.
    this.progressIntervalId = null;

    // Listeners other code can subscribe to, so the UI (App.js)
    // can react when playback state changes, without the class
    // needing to know anything about the DOM.
    this.listeners = {
      onSongChange: [],   // fired when a new song starts loading
      onPlayStateChange: [], // fired on play/pause
      onProgressTick: [], // fired ~4x/sec while playing
      onError: []         // fired when something goes wrong
    };
  }

  // ==========================================
  // EVENT SUBSCRIPTION
  // ==========================================
  // Lets App.js (or a future mini-player) react to state changes
  // without this class needing to touch the DOM directly. Keeps
  // playback logic and UI rendering cleanly separated.

  on(eventName, callback) {
    if (!this.listeners[eventName]) {
      throw new Error(`Unknown MusicPlayer event: "${eventName}"`);
    }
    this.listeners[eventName].push(callback);
  }

  _emit(eventName, payload) {
    this.listeners[eventName].forEach((callback) => callback(payload));
  }

  // ==========================================
  // CORE PLAYBACK
  // ==========================================

  /**
   * Loads and plays a song by id. Faithful port of the audio-
   * loading half of the original handleStreamSong function.
   *
   * @param {string} songId
   * @param {boolean} pushToHistory - whether to record this in
   *   the back-navigation history stack (defaults to true, same
   *   as the original function's default)
   */
  play(songId, pushToHistory = true) {
    const song = this.songCacheMap.get(songId);
    if (!song) {
      this._emit('onError', { message: `Song "${songId}" was not found.` });
      return;
    }

    this.state.currentSongId = songId;

    this._clearProgressInterval();

    // Stop whatever's currently playing before loading the new track
    if (this.audioElement) {
      this.audioElement.pause();
      this.audioElement = null;
    }

    if (pushToHistory) {
      const topOfStack = this.state.historyStack[this.state.historyStack.length - 1];
      if (topOfStack !== songId) {
        this.state.historyStack.push(songId);
      }
    }

    this._emit('onSongChange', { song });

    this.audioElement = new Audio(song.audioUrl);

    this.audioElement.play().then(() => {
      this._emit('onPlayStateChange', { isPlaying: true, autoplayBlocked: false });
    }).catch(() => {
      // Browser blocked autoplay - same handling as the original,
      // just reported through an event instead of touching the
      // DOM directly.
      this._emit('onPlayStateChange', { isPlaying: false, autoplayBlocked: true });
    });

    // Same 250ms progress tick as the original setInterval
    this.progressIntervalId = setInterval(() => {
      if (!this.audioElement || !this.audioElement.duration) return;
      this._emit('onProgressTick', {
        currentTime: this.audioElement.currentTime,
        duration: this.audioElement.duration
      });
    }, 250);

    // Auto-advance when the song finishes, same as the original
    this.audioElement.addEventListener('ended', () => {
      this._clearProgressInterval();
      this.next();
    });
  }

  /**
   * Toggles play/pause on the current audio element. Faithful
   * port of the playPauseButton click handler.
   */
  togglePlayPause() {
    if (!this.audioElement) return;

    if (this.audioElement.paused) {
      this.audioElement.play();
      this._emit('onPlayStateChange', { isPlaying: true, autoplayBlocked: false });
    } else {
      this.audioElement.pause();
      this._emit('onPlayStateChange', { isPlaying: false, autoplayBlocked: false });
    }
  }

  /**
   * Sets playback speed. Faithful port of the speedController
   * change handler.
   * @param {number} rate
   */
  setSpeed(rate) {
    if (!this.audioElement) return;
    this.audioElement.playbackRate = rate;
  }

  /**
   * Seeks to a position in the current track, given as a 0-100
   * percentage (matches the existing timeline slider's range).
   * Faithful port of the timelineSlider input handler.
   * @param {number} percent
   */
  seekToPercent(percent) {
    if (!this.audioElement || !this.audioElement.duration) return;
    this.audioElement.currentTime = (percent / 100) * this.audioElement.duration;
  }

  // ==========================================
  // NAVIGATION (uses the history stack + database order)
  // ==========================================

  /**
   * Moves to the next song in the database order. Faithful port
   * of handleNavigationForward - no shuffle yet, that's the next
   * step after this class is tested and confirmed working.
   */
  next() {
    if (this.songDatabase.length === 0) return;

    const currentIndex = this.songDatabase.findIndex(
      (song) => song.id === this.state.currentSongId
    );
    let nextIndex = currentIndex + 1;
    if (nextIndex >= this.songDatabase.length) {
      nextIndex = 0;
    }

    const nextSong = this.songDatabase[nextIndex];
    this.play(nextSong.id, true);
  }

  /**
   * Moves back to the previous song using the history stack.
   * Faithful port of handleNavigationBackwards.
   */
  previous() {
    if (this.state.historyStack.length <= 1) {
      this._emit('onError', { message: 'No further history tracked.' });
      return;
    }

    this.state.historyStack.pop();
    const previousSongId = this.state.historyStack[this.state.historyStack.length - 1];
    this.play(previousSongId, false);
  }

  // ==========================================
  // CLEANUP
  // ==========================================

  /**
   * Stops playback and clears the progress interval. Faithful
   * port of safelyPurgeActiveIntervals, extended to also stop
   * the audio element since this is now the single place that
   * owns it.
   */
  cleanup() {
    this._clearProgressInterval();
    if (this.audioElement) {
      this.audioElement.pause();
      this.audioElement = null;
    }
  }

  _clearProgressInterval() {
    if (this.progressIntervalId) {
      clearInterval(this.progressIntervalId);
      this.progressIntervalId = null;
    }
  }

  // ==========================================
  // READ-ONLY HELPERS FOR THE UI
  // ==========================================

  getCurrentSong() {
    if (!this.state.currentSongId) return null;
    return this.songCacheMap.get(this.state.currentSongId) || null;
  }

  canGoBack() {
    return this.state.historyStack.length > 1;
  }
}

window.MusicPlayer = MusicPlayer;