/* global Notyf */

// ==========================================
// 1. GLOBAL CORE ENVIRONMENT VARIABLES
// ==========================================

let songsDatabase = []; 
let notificationEngine;
let playbackHistoryStack = [];
const songCacheMap = new Map();

let currentAudioElement = null; 
let currentActiveSongId = sessionStorage.getItem('current_playing_song_id') || null;
let progressUpdateInterval = null;

let repeatMode = 'off'; // one of REPEAT_MODES from types.js
let isShuffleOn = false;
let shuffleQueue = [];
let currentPlaybackSpeed = 1.0; // persists across song changes, resets only on full page reload

// Fisher-Yates shuffle - builds a fresh randomised "bag" of every
// song except the one currently playing, so shuffle mode plays
// through the whole catalogue once before any repeats happen.
function buildShuffleQueue() {
  const ids = songsDatabase.map(song => song.id).filter(id => id !== currentActiveSongId);
  for (let i = ids.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [ids[i], ids[j]] = [ids[j], ids[i]];
  }
  return ids;
}

// Icon-only SVGs (currentColor so they inherit each button's
// colour/hover state, unlike emoji which ignore CSS color).
// Declared once here at module level - NOT inside handleStreamSong -
// since these never change between songs, and re-declaring a
// const every time a song loads would throw on the second song.
const ICON_PREV = '<svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M6 6h2v12H6zm3.5 6l8.5 6V6z"/></svg>';
const ICON_NEXT = '<svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M16 6h2v12h-2zM6 6l8.5 6L6 18z"/></svg>';
const ICON_PLAY = '<svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>';
const ICON_PAUSE = '<svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M6 5h4v14H6zM14 5h4v14h-4z"/></svg>';
const ICON_DOWNLOAD = '<svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M12 3v10.5l3.5-3.5L17 11.5 12 16.5 7 11.5l1.5-1.5 3.5 3.5V3zM5 19h14v2H5z"/></svg>';
const ICON_SHUFFLE = '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2"><path d="M16 3h5v5M4 20L21 3M21 16v5h-5M15 15l6 6M4 4l5 5"/></svg>';
const ICON_REPEAT = '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 1l4 4-4 4M3 11V9a4 4 0 0 1 4-4h14M7 23l-4-4 4-4M21 13v2a4 4 0 0 1-4 4H3"/></svg>';
const ICON_REPEAT_ONE = '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 1l4 4-4 4M3 11V9a4 4 0 0 1 4-4h14M7 23l-4-4 4-4M21 13v2a4 4 0 0 1-4 4H3"/><text x="10" y="15" font-size="8" fill="currentColor" stroke="none">1</text></svg>';

// ==========================================
// 2. LIFECYCLE INITIALIZATION PIPELINE
// ==========================================

window.addEventListener('DOMContentLoaded', () => {
  if (typeof Notyf !== 'undefined') {
    notificationEngine = new Notyf({
      duration: 2500,
      position: { x: 'right', y: 'bottom' },
      ripple: false
    });
  }

// If the server redirected here because the requested URL didn't
// match any real page, show a clear message explaining why -
// rather than the user just silently landing on the homepage with
// no idea their original link was broken.
const urlErrorParams = new URLSearchParams(window.location.search);
if (urlErrorParams.get('error') === 'notfound') {
  if (notificationEngine) {
    notificationEngine.error("That page doesn't exist. We've brought you back to the homepage.");
  }
  // Clean the ?error=notfound out of the URL bar so refreshing
  // the page doesn't show the same message again.
  window.history.replaceState({}, '', 'index.html');
}

  const catalogueContainer = document.getElementById('songs-container');
  if (catalogueContainer) {
    catalogueContainer.innerHTML = '<p class="text-muted-fallback">⏳ Loading songs...</p>';
  }

  const welcomeMessage = sessionStorage.getItem('welcome_message');
  if (welcomeMessage && notificationEngine) {
    notificationEngine.success(welcomeMessage);
    sessionStorage.removeItem('welcome_message');
  }

  fetch('/database.json')
    .then(response => {
      if (!response.ok) throw new Error('Network pipeline response was not operational');
      return response.json();
    })
    .then(data => {
      songsDatabase = createSongDatabase(data);
      songsDatabase.forEach(song => songCacheMap.set(song.id, song));
      
      renderSongCatalogue(songsDatabase);
      runCalendarSelection();
      
      const urlParams = new URLSearchParams(window.location.search);
      const requestedSongId = urlParams.get('song');
      
      if (requestedSongId && document.getElementById('player-container')) {
        if (songCacheMap.has(requestedSongId)) {
          handleStreamSong(requestedSongId, true);
        } else {
          renderInvalidSongLink(requestedSongId);
        }
      }
    })
    .catch(error => {
      console.error(error);

      const container = document.getElementById('songs-container');
      if (container) {
        container.innerHTML = '';
        const errorMessage = document.createElement('p');
        errorMessage.className = 'text-muted-fallback';
        errorMessage.textContent = "We couldn't load the song catalogue. Please check your connection and refresh the page.";
        container.appendChild(errorMessage);
      }

      if (notificationEngine) {
        notificationEngine.error('Failed to load songs. Please refresh.');
      }
    });
    
  const searchInput = document.getElementById('search-input');
if (searchInput) {
  let debounceTimeoutPointer;
  searchInput.addEventListener('input', () => {
    clearTimeout(debounceTimeoutPointer);
    debounceTimeoutPointer = setTimeout(() => {
      executeCompoundFiltering();
      renderSearchSuggestions(searchInput.value);
    }, 250);
  });

  // Re-show suggestions if the user clicks back into the search
  // bar with existing text still in it - previously the dropdown
  // only rebuilt on typing, so clicking away and back left it
  // closed even though the matching text was still there.
  searchInput.addEventListener('focus', () => {
    if (searchInput.value.trim().length > 0) {
      renderSearchSuggestions(searchInput.value);
    }
  });
}

  if (document.getElementById('songs-container')) {
    window.addEventListener('auth-state-changed', () => {
      window.location.reload();
    });
  }
});

// ==========================================
// 3. SELECTION STRUCTURE: Calendar Engine
// ==========================================
function runCalendarSelection() {
  const currentDay = new Date().getDay(); 
  const scheduleTextElement = document.getElementById('schedule-text');
  if (!scheduleTextElement) return;

  switch (currentDay) {
    case 1: scheduleTextElement.textContent = "Monday Chapel Service: Focus on traditional foundation hymns."; break;
    case 2: scheduleTextElement.textContent = "Tuesday Assembly: General school announcements performance."; break;
    case 4: scheduleTextElement.textContent = "Thursday Congregational Practice: Focus on full anthem vocals."; break;
    case 5: scheduleTextElement.textContent = "Friday House Singing: High-energy school spirit preparation."; break;
    default: scheduleTextElement.textContent = "Independent Practice Mode: Keep our musical traditions sharp.";
  }
}

// ==========================================
// 4. ITERATION STRUCTURE: UI Render Engine
// ==========================================
function renderSongCatalogue(songsArray) {
  const container = document.getElementById('songs-container');
  if (!container) return;

  container.innerHTML = '';

  if (songsArray.length === 0) {
  const emptyState = document.createElement('div');
  emptyState.className = 'search-empty-state';

  const icon = document.createElement('div');
  icon.className = 'search-empty-icon';

  const title = document.createElement('h3');
  title.className = 'search-empty-title';

  const text = document.createElement('p');
  text.className = 'search-empty-text';

  // Tailor the empty state specifically for "My Favourites with
  // zero saved songs" rather than showing the same generic
  // "no search results" message for a completely different reason.
  if (activeFavouritesFilter) {
    icon.classList.add('favourites-empty-icon');
    icon.textContent = '♡';
    title.textContent = 'No favourites yet';
    text.textContent = "You haven't favourited any songs yet. Tap the heart icon on any song card to save it here for quick access later.";
  } else {
    icon.textContent = '🔍';
    title.textContent = 'No songs found';
    text.textContent = "We couldn't find any songs matching your search or filters. Try a different search term, or clear your filters to see the full catalogue.";
  }

  const clearBtn = document.createElement('button');
  clearBtn.type = 'button';
  clearBtn.className = 'btn search-empty-clear-btn';
  clearBtn.textContent = activeFavouritesFilter ? 'Clear Filters' : 'Clear Search & Filters';
    clearBtn.addEventListener('click', () => {
      const searchInput = document.getElementById('search-input');
      if (searchInput) searchInput.value = '';

      activeTypeFilter = 'all';
      activeLengthFilter = 'all';
      activeFavouritesFilter = false;

      document.querySelectorAll('.filter-btn').forEach(btn => btn.classList.remove('active'));
      const allTypeBtn = document.getElementById('filter-all-type');
      const allLenBtn = document.getElementById('filter-all-len');
      if (allTypeBtn) allTypeBtn.classList.add('active');
      if (allLenBtn) allLenBtn.classList.add('active');

      const dropdown = document.getElementById('suggestions-dropdown');
      if (dropdown) dropdown.classList.add('hidden');

      renderSongCatalogue(songsDatabase);
    });

    emptyState.appendChild(icon);
    emptyState.appendChild(title);
    emptyState.appendChild(text);
    emptyState.appendChild(clearBtn);
    container.appendChild(emptyState);
    return;
  }

  const account = new UserAccount();
  const loggedIn = account.isLoggedIn();

  songsArray.forEach(song => {
    const cardElement = document.createElement('div');
    cardElement.className = 'card';

    // Highlight the card matching whatever song is currently loaded
    // in the player, so returning to the catalogue shows at a glance
    // what's currently playing rather than giving no indication at all.
    const isCurrentlyPlaying = song.id === currentActiveSongId;
    if (isCurrentlyPlaying) {
      cardElement.classList.add('is-now-playing');
    }

    const cardTitle = document.createElement('h3');
    cardTitle.textContent = song.title;

    const cardP = document.createElement('p');
    cardP.textContent = song.history;

    const typeBadge = document.createElement('span');
    typeBadge.className = 'suggestion-meta';
    typeBadge.textContent = song.type;

    if (loggedIn) {
      const favouriteButton = document.createElement('button');
      favouriteButton.className = 'favourite-btn';
      const isFav = account.isFavourited(song.id);
      favouriteButton.classList.toggle('is-favourited', isFav);
      favouriteButton.innerHTML = isFav ? '♥' : '♡';
      favouriteButton.setAttribute('aria-label', isFav ? 'Remove from favourites' : 'Add to favourites');
      favouriteButton.title = isFav ? 'Remove from favourites' : 'Add to favourites';
      favouriteButton.addEventListener('click', (event) => {
        event.stopPropagation();

        // Briefly disable the button for the duration of the toggle -
        // prevents a rapid double-click from firing toggleFavourite()
        // twice in quick succession.
        if (favouriteButton.disabled) return;
        favouriteButton.disabled = true;

        try {
          const nowFavourited = account.toggleFavourite(song.id);
          favouriteButton.classList.toggle('is-favourited', nowFavourited);
          favouriteButton.innerHTML = nowFavourited ? '♥' : '♡';
          favouriteButton.setAttribute('aria-label', nowFavourited ? 'Remove from favourites' : 'Add to favourites');
          favouriteButton.title = nowFavourited ? 'Remove from favourites' : 'Add to favourites';
          if (notificationEngine) {
            notificationEngine.success(nowFavourited ? `Added "${song.title}" to favourites` : `Removed "${song.title}" from favourites`);
          }
          if (activeFavouritesFilter && !nowFavourited) {
            executeCompoundFiltering();
          }
        } catch (error) {
          if (notificationEngine) notificationEngine.error('Could not update favourites.');
          console.error(error);
        } finally {
          setTimeout(() => {
            favouriteButton.disabled = false;
          }, 300);
        }
      });
      cardElement.appendChild(favouriteButton);
    }

    const loadButton = document.createElement('button');
    loadButton.className = 'btn';
    loadButton.textContent = '▶️ Play';
    
    loadButton.addEventListener('click', () => {
      window.location.href = `player.html?song=${song.id}`;
    });

    if (isCurrentlyPlaying) {
      const nowPlayingBadge = document.createElement('span');
      nowPlayingBadge.className = 'now-playing-badge';
      nowPlayingBadge.textContent = 'Now Playing';
      cardElement.appendChild(nowPlayingBadge);
    }

    cardElement.appendChild(cardTitle);
    cardElement.appendChild(typeBadge);
    cardElement.appendChild(cardP);
    cardElement.appendChild(loadButton);
    container.appendChild(cardElement);
  });
}

// ==========================================
// 5. PIPELINE INTERACTION: High-Speed Stream Engine
// ==========================================
function handleStreamSong(songId, shouldPushToHistory = true) {
  const playerContainer = document.getElementById('player-container');
  if (!playerContainer) return;

  const activeSong = songCacheMap.get(songId);
  if (!activeSong) {
    renderInvalidSongLink(songId);
    return;
  }

  currentActiveSongId = songId;
  sessionStorage.setItem('current_playing_song_id', songId); // persists across full page navigations

  safelyPurgeActiveIntervals();
  
  if (currentAudioElement) {
    currentAudioElement.pause();
    currentAudioElement = null;
  }

  if (shouldPushToHistory) {
    const topOfStack = playbackHistoryStack[playbackHistoryStack.length - 1];
    if (topOfStack !== songId) {
      playbackHistoryStack.push(songId); 
    }
  }

  playerContainer.innerHTML = '';

  if (notificationEngine) {
    notificationEngine.success(`Streaming: ${activeSong.title}`);
  }

  const playerBox = document.createElement('div');
  playerBox.className = 'player-box';

  const sourceIndicator = document.createElement('div');
  sourceIndicator.className = 'player-source';
  sourceIndicator.style.display = 'flex';
  sourceIndicator.style.alignItems = 'center';
  sourceIndicator.style.justifyContent = 'center';

  const sourceText = document.createElement('span');
  sourceText.textContent = '📡 CUSTOM MULTIMEDIA STATION ACTIVATED';

  const equalizer = document.createElement('span');
  equalizer.className = 'equalizer';
  equalizer.id = 'now-playing-equalizer';
  equalizer.innerHTML = '<span class="equalizer-bar"></span><span class="equalizer-bar"></span><span class="equalizer-bar"></span><span class="equalizer-bar"></span>';

  sourceIndicator.appendChild(sourceText);
  sourceIndicator.appendChild(equalizer);

  const trackTitle = document.createElement('h2');
  trackTitle.className = 'track-heading';
  trackTitle.textContent = activeSong.title;

  // Lets the user copy a direct, shareable link to the currently
// playing song using the browser's Clipboard API - a small,
// self-contained addition that doesn't touch any existing logic.
const copyLinkBtn = document.createElement('button');
copyLinkBtn.type = 'button';
copyLinkBtn.className = 'copy-link-btn';
copyLinkBtn.textContent = '🔗 Copy song link';
copyLinkBtn.style.display = 'block';
copyLinkBtn.style.margin = '0 auto 10px auto';
copyLinkBtn.addEventListener('click', () => {
  const songUrl = `${window.location.origin}/player.html?song=${songId}`;
  navigator.clipboard.writeText(songUrl).then(() => {
    if (notificationEngine) notificationEngine.success('Song link copied to clipboard!');

    // Briefly change the button's own text as an immediate,
    // localized confirmation right where the user is looking -
    // a toast in the corner can be easy to miss if their eyes
    // are still on the button they just clicked.
    const originalText = copyLinkBtn.textContent;
    copyLinkBtn.textContent = '✅ Copied to clipboard!';
    copyLinkBtn.disabled = true;

    setTimeout(() => {
      copyLinkBtn.textContent = originalText;
      copyLinkBtn.disabled = false;
    }, 2000);
  }).catch(() => {
    if (notificationEngine) notificationEngine.error('Could not copy link. Please copy the URL manually.');
  });
});

  // ==========================================
  // MULTI-MODE LYRICS LEARNING MODULE
  // ==========================================
  const lyricsModuleContainer = document.createElement('div');
  lyricsModuleContainer.className = 'lyrics-module-container';

  const lyricsTabRow = document.createElement('div');
  lyricsTabRow.className = 'lyrics-tab-row';

  const lyricsContentArea = document.createElement('div');
  lyricsContentArea.className = 'lyrics-content-area';

  const songLines = activeSong.lyrics.split('\n').map(line => line.trim()).filter(line => line.length > 0);
  
  const modes = ['Full Lyrics', 'Line-by-Line', 'Flashcards'];
  let currentMode = 'Full Lyrics';
  let currentLineIndex = 0;
  let isCardFlipped = false;

  modes.forEach(mode => {
    const tabButton = document.createElement('button');
    tabButton.className = `lyrics-tab ${mode === currentMode ? 'active' : ''}`;
    tabButton.textContent = mode;
    tabButton.addEventListener('click', () => {
      Array.from(lyricsTabRow.children).forEach(btn => btn.classList.remove('active'));
      tabButton.classList.add('active');
      
      currentMode = mode;
      isCardFlipped = false; 
      renderLyricsInterface();
    });
    lyricsTabRow.appendChild(tabButton);
  });

  function renderLyricsInterface() {
    lyricsContentArea.innerHTML = '';

    if (currentMode === 'Full Lyrics') {
      const fullDisplay = document.createElement('div');
      fullDisplay.className = 'lyrics-display';
      fullDisplay.style.marginTop = '0'; 
      fullDisplay.style.border = 'none';
      fullDisplay.style.boxShadow = 'none';
      fullDisplay.style.background = 'transparent';
      fullDisplay.textContent = activeSong.lyrics;
      lyricsContentArea.appendChild(fullDisplay);
    } 
    else if (currentMode === 'Line-by-Line') {
      const lineDisplay = document.createElement('div');
      lineDisplay.className = 'line-display';
      lineDisplay.textContent = songLines[currentLineIndex];

      const controls = createLearningControls();
      lyricsContentArea.appendChild(lineDisplay);
      lyricsContentArea.appendChild(controls);
    } 
    else if (currentMode === 'Flashcards') {
      const scene = document.createElement('div');
      scene.className = 'flashcard-scene';

      const card = document.createElement('div');
      card.className = `flashcard ${isCardFlipped ? 'is-flipped' : ''}`;
      
      scene.addEventListener('click', () => {
        isCardFlipped = !isCardFlipped;
        card.classList.toggle('is-flipped');
      });

      const frontFace = document.createElement('div');
      frontFace.className = 'flashcard-face flashcard-front';
      
      const hintLabel = document.createElement('div');
      hintLabel.className = 'flashcard-hint-label';
      hintLabel.textContent = currentLineIndex === 0 ? 'Starting Line' : 'Previous Line';

      const hintText = document.createElement('div');
      hintText.className = 'flashcard-hint-text';
      hintText.textContent = currentLineIndex === 0 ? "(Beginning of the song)" : songLines[currentLineIndex - 1];

      const clickPrompt = document.createElement('div');
      clickPrompt.className = 'flashcard-click-prompt';
      clickPrompt.textContent = 'Click to reveal next line';

      frontFace.appendChild(hintLabel);
      frontFace.appendChild(hintText);
      frontFace.appendChild(clickPrompt);

      const backFace = document.createElement('div');
      backFace.className = 'flashcard-face flashcard-back';
      backFace.textContent = songLines[currentLineIndex];

      card.appendChild(frontFace);
      card.appendChild(backFace);
      scene.appendChild(card);

      const controls = createLearningControls();
      lyricsContentArea.appendChild(scene);
      lyricsContentArea.appendChild(controls);
    }
  }

  function createLearningControls() {
    const controlsContainer = document.createElement('div');
    controlsContainer.className = 'learning-controls';

    const prevBtn = document.createElement('button');
    prevBtn.className = 'btn-secondary';
    prevBtn.textContent = '← Prev Line';
    prevBtn.disabled = currentLineIndex === 0;
    prevBtn.addEventListener('click', () => {
      if (currentLineIndex > 0) {
        currentLineIndex--;
        isCardFlipped = false;
        renderLyricsInterface();
      }
    });

    const progress = document.createElement('span');
    progress.className = 'learning-progress';
    progress.textContent = `${currentLineIndex + 1} / ${songLines.length}`;

    const nextBtn = document.createElement('button');
    nextBtn.className = 'btn-secondary';
    nextBtn.textContent = 'Next Line →';
    nextBtn.disabled = currentLineIndex === songLines.length - 1;
    nextBtn.addEventListener('click', () => {
      if (currentLineIndex < songLines.length - 1) {
        currentLineIndex++;
        isCardFlipped = false;
        renderLyricsInterface();
      }
    });

    controlsContainer.appendChild(prevBtn);
    controlsContainer.appendChild(progress);
    controlsContainer.appendChild(nextBtn);
    
    return controlsContainer;
  }

  renderLyricsInterface();

  lyricsModuleContainer.appendChild(lyricsTabRow);
  lyricsModuleContainer.appendChild(lyricsContentArea);

  // ==========================================
  // CUSTOM MEDIA CONTROLLER DASHBOARD
  // ==========================================
  const controlDashboard = document.createElement('div');
  controlDashboard.className = 'control-dashboard';

  const buttonRow = document.createElement('div');
  buttonRow.className = 'control-button-row';

  const prevButton = document.createElement('button');
  prevButton.className = 'btn btn-nav btn-icon';
  prevButton.innerHTML = ICON_PREV;
  prevButton.setAttribute('aria-label', 'Previous song');
  prevButton.title = 'Previous';
  if (playbackHistoryStack.length <= 1) {
    prevButton.disabled = true;
  } else {
    prevButton.addEventListener('click', handleNavigationBackwards);
  }

  const playPauseButton = document.createElement('button');
  playPauseButton.className = 'btn btn-play btn-icon';
  playPauseButton.innerHTML = ICON_PAUSE;
  playPauseButton.setAttribute('aria-label', 'Pause');
  playPauseButton.title = 'Pause';
  playPauseButton.addEventListener('click', () => {
    if (currentAudioElement.paused) {
      currentAudioElement.play();
      playPauseButton.innerHTML = ICON_PAUSE;
      playPauseButton.setAttribute('aria-label', 'Pause');
      playPauseButton.title = 'Pause';
      playPauseButton.classList.remove('is-paused');
      equalizer.classList.add('is-playing');
    } else {
      currentAudioElement.pause();
      playPauseButton.innerHTML = ICON_PLAY;
      playPauseButton.setAttribute('aria-label', 'Play');
      playPauseButton.title = 'Play';
      playPauseButton.classList.add('is-paused');
      equalizer.classList.remove('is-playing');
    }
  });

  const forwardButton = document.createElement('button');
  forwardButton.className = 'btn btn-nav btn-icon';
  forwardButton.innerHTML = ICON_NEXT;
  forwardButton.setAttribute('aria-label', 'Next song');
  forwardButton.title = 'Next';
  forwardButton.addEventListener('click', handleNavigationForward);

  // ---- Shuffle button ----
  // Disabled outright (not just blocked on click) whenever the
  // catalogue has fewer than 2 songs, so the user can see at a
  // glance that shuffle isn't available right now, rather than
  // discovering it only after clicking.
  const shuffleButton = document.createElement('button');
  shuffleButton.className = 'btn btn-nav btn-icon';
  shuffleButton.innerHTML = ICON_SHUFFLE;

  const shuffleUnavailable = songsDatabase.length <= 1;

  if (shuffleUnavailable) {
    shuffleButton.disabled = true;
    shuffleButton.setAttribute('aria-label', 'Shuffle unavailable - only one song in the catalogue');
    shuffleButton.title = 'Shuffle needs at least 2 songs in the catalogue';
  } else {
    if (isShuffleOn) shuffleButton.classList.add('toggle-active');
    shuffleButton.setAttribute('aria-label', isShuffleOn ? 'Shuffle on' : 'Shuffle off');
    shuffleButton.title = isShuffleOn ? 'Shuffle on' : 'Shuffle off';
    shuffleButton.addEventListener('click', () => {
      isShuffleOn = !isShuffleOn;
      shuffleQueue = [];
      shuffleButton.classList.toggle('toggle-active', isShuffleOn);
      shuffleButton.setAttribute('aria-label', isShuffleOn ? 'Shuffle on' : 'Shuffle off');
      shuffleButton.title = isShuffleOn ? 'Shuffle on' : 'Shuffle off';

      if (notificationEngine) {
        notificationEngine.success({
          message: isShuffleOn ? 'Shuffle on' : 'Shuffle off',
          className: 'notyf-mode-toast'
        });
      }
    });
  }

  const repeatButton = document.createElement('button');
  repeatButton.className = 'btn btn-nav btn-icon';
  const REPEAT_CYCLE = window.REPEAT_MODES;

  function updateRepeatButtonUI() {
    repeatButton.classList.toggle('toggle-active', repeatMode !== 'off');
    repeatButton.innerHTML = repeatMode === 'one' ? ICON_REPEAT_ONE : ICON_REPEAT;
    const label = repeatMode === 'off' ? 'Repeat off' : repeatMode === 'one' ? 'Repeat one song' : 'Repeat all songs';
    repeatButton.setAttribute('aria-label', label);
    repeatButton.title = label;
  }
  updateRepeatButtonUI();

  repeatButton.addEventListener('click', () => {
    const currentIndex = REPEAT_CYCLE.indexOf(repeatMode);
    const nextMode = REPEAT_CYCLE[(currentIndex + 1) % REPEAT_CYCLE.length];

    if (!window.isValidRepeatMode(nextMode)) return;

    repeatMode = nextMode;
    updateRepeatButtonUI();
    const modeLabel = repeatMode === 'off' ? 'Off' : repeatMode === 'one' ? 'One song' : 'All songs';

    if (notificationEngine) {
      notificationEngine.success({
        message: `Repeat: ${modeLabel}`,
        className: 'notyf-mode-toast'
      });
    }
  });

  const downloadButton = document.createElement('a');
  downloadButton.className = 'btn btn-download btn-icon';
  downloadButton.href = activeSong.audioUrl;
  downloadButton.download = `${activeSong.title.replace(/\s+/g, '_')}_Practice_Track.mp3`;
  downloadButton.innerHTML = ICON_DOWNLOAD;
  downloadButton.setAttribute('aria-label', 'Download track');
  downloadButton.title = 'Download';
  downloadButton.addEventListener('click', () => {
    if (notificationEngine) notificationEngine.success('Downloading media file...');
  });

  const speedController = document.createElement('select');
  speedController.className = 'btn btn-speed-select btn-speed-compact';
  speedController.setAttribute('aria-label', 'Playback speed');

  const speedOptions = [
    { value: 0.5, label: '0.5x' },
    { value: 0.75, label: '0.75x' },
    { value: 1.0, label: '1x' },
    { value: 1.25, label: '1.25x' },
    { value: 1.5, label: '1.5x' }
  ];

  speedOptions.forEach(opt => {
    const optionElement = document.createElement('option');
    optionElement.value = opt.value;
    optionElement.textContent = opt.label;
    optionElement.style.background = '#111827'; 
    optionElement.style.color = '#ffffff';
    if (opt.value === currentPlaybackSpeed) optionElement.selected = true;
    speedController.appendChild(optionElement);
  });

  speedController.addEventListener('change', (event) => {
    const newSpeed = parseFloat(event.target.value);
    currentPlaybackSpeed = newSpeed;
    if (currentAudioElement) {
      currentAudioElement.playbackRate = newSpeed;
      if (notificationEngine) {
        notificationEngine.success(`Playback speed set to ${newSpeed}x`);
      }
    }
  });

  const primaryControls = document.createElement('div');
  primaryControls.className = 'control-primary-group';
  primaryControls.appendChild(shuffleButton);
  primaryControls.appendChild(prevButton);
  primaryControls.appendChild(playPauseButton);
  primaryControls.appendChild(forwardButton);
  primaryControls.appendChild(repeatButton);

  const secondaryControls = document.createElement('div');
  secondaryControls.className = 'control-secondary-group';
  secondaryControls.appendChild(downloadButton);
  secondaryControls.appendChild(speedController);

  buttonRow.appendChild(primaryControls);
  buttonRow.appendChild(secondaryControls);

  currentAudioElement = new Audio(activeSong.audioUrl);
  currentAudioElement.playbackRate = currentPlaybackSpeed;

  currentAudioElement.play().then(() => {
    equalizer.classList.add('is-playing');
  }).catch((error) => {
    if (notificationEngine) {
      notificationEngine.error('Autoplay blocked by browser. Please press Play.');
    }
    playPauseButton.innerHTML = ICON_PLAY;
    playPauseButton.setAttribute('aria-label', 'Play');
    playPauseButton.title = 'Play';
    playPauseButton.classList.add('is-paused');
    equalizer.classList.remove('is-playing');
  });

  const timelineContainer = document.createElement('div');
  timelineContainer.className = 'control-timeline-row';

  const currentTimeText = document.createElement('span');
  currentTimeText.className = 'timeline-time';
  currentTimeText.textContent = '0:00';

  const timelineSlider = document.createElement('input');
  timelineSlider.type = 'range';
  timelineSlider.min = '0';
  timelineSlider.max = '100';
  timelineSlider.value = '0';
  timelineSlider.className = 'timeline-slider';

  const totalTimeText = document.createElement('span');
  totalTimeText.className = 'timeline-time';
  totalTimeText.textContent = '0:00';

  timelineSlider.addEventListener('input', () => {
    if (!currentAudioElement.duration) return;
    currentAudioElement.currentTime = (timelineSlider.value / 100) * currentAudioElement.duration;
  });

  timelineContainer.appendChild(currentTimeText);
  timelineContainer.appendChild(timelineSlider);
  timelineContainer.appendChild(totalTimeText);

  controlDashboard.appendChild(buttonRow);
  controlDashboard.appendChild(timelineContainer);

  playerBox.appendChild(sourceIndicator);
  playerBox.appendChild(trackTitle);
  playerBox.appendChild(controlDashboard);
  playerBox.appendChild(copyLinkBtn);
  playerBox.appendChild(lyricsModuleContainer);

  playerContainer.appendChild(playerBox);

  progressUpdateInterval = setInterval(() => {
    if (!currentAudioElement || !currentAudioElement.duration) return;
    
    timelineSlider.value = (currentAudioElement.currentTime / currentAudioElement.duration) * 100;

    const currentMin = Math.floor(currentAudioElement.currentTime / 60);
    const currentSec = Math.floor(currentAudioElement.currentTime % 60).toString().padStart(2, '0');
    currentTimeText.textContent = `${currentMin}:${currentSec}`;

    const totalMin = Math.floor(currentAudioElement.duration / 60);
    const totalSec = Math.floor(currentAudioElement.duration % 60).toString().padStart(2, '0');
    totalTimeText.textContent = `${totalMin}:${totalSec}`;
  }, 250);

  currentAudioElement.addEventListener('ended', () => {
    safelyPurgeActiveIntervals();
    handleNavigationForward();
  });
}

// ==========================================
// 5b. BROKEN / TAMPERED LINK HANDLING
// ==========================================
function renderInvalidSongLink(requestedSongId) {
  const playerContainer = document.getElementById('player-container');
  if (!playerContainer) return;

  safelyPurgeActiveIntervals();
  if (currentAudioElement) {
    currentAudioElement.pause();
    currentAudioElement = null;
  }

  playerContainer.innerHTML = '';

  const errorBox = document.createElement('div');
  errorBox.className = 'player-empty-state player-error-state';

  const icon = document.createElement('div');
  icon.className = 'player-empty-icon';
  icon.textContent = '⚠️';

  const title = document.createElement('h2');
  title.className = 'player-empty-title';
  title.textContent = 'Track Not Found';

  const text = document.createElement('p');
  text.className = 'player-empty-text';
  text.textContent = `We couldn't find a track matching "${requestedSongId}". The link may be mistyped, out of date, or point to a song that no longer exists.`;

  const backBtn = document.createElement('a');
  backBtn.className = 'player-empty-btn';
  backBtn.href = 'songs.html';
  backBtn.textContent = '← Back to Song Catalogue';

  errorBox.appendChild(icon);
  errorBox.appendChild(title);
  errorBox.appendChild(text);
  errorBox.appendChild(backBtn);

  playerContainer.appendChild(errorBox);

  if (notificationEngine) {
    notificationEngine.error('That song link is invalid.');
  }
}

// ==========================================
// 6. COMPLEX DATA STRUCTURE POINTER LOGIC
// ==========================================

function handleNavigationBackwards() {
  if (playbackHistoryStack.length <= 1) {
    if (notificationEngine) notificationEngine.error('No further history tracked.');
    return; 
  }

  playbackHistoryStack.pop(); 
  const targetPreviousSongId = playbackHistoryStack[playbackHistoryStack.length - 1];
  handleStreamSong(targetPreviousSongId, false);
}

function handleNavigationForward() {
  if (songsDatabase.length === 0) return;

  if (repeatMode === 'one' && currentActiveSongId) {
    handleStreamSong(currentActiveSongId, false);
    return;
  }

  if (songsDatabase.length <= 1) {
  shuffleButton.disabled = true;
  shuffleButton.title = 'Shuffle needs at least 2 songs in the catalogue';
}

  if (isShuffleOn) {
    if (shuffleQueue.length === 0) {
      shuffleQueue = buildShuffleQueue();
    }
    const nextSongId = shuffleQueue.shift();
    if (nextSongId) {
      handleStreamSong(nextSongId, true);
    } else if (notificationEngine) {
      notificationEngine.error('No other songs available to shuffle to.');
    }
    return;
  }

  const currentDatabaseIndex = songsDatabase.findIndex(song => song.id === currentActiveSongId);
  let nextDatabaseIndex = currentDatabaseIndex + 1;

  if (nextDatabaseIndex >= songsDatabase.length) {
    if (repeatMode !== 'all') {
      if (notificationEngine) notificationEngine.success('Reached the end of the catalogue.');
      return;
    }
    nextDatabaseIndex = 0;
  }

  const nextSongTarget = songsDatabase[nextDatabaseIndex];
  handleStreamSong(nextSongTarget.id, true);
}

// ==========================================
// 7. GARBAGE DISPOSAL & EXCEPTION CLEANING
// ==========================================

function safelyPurgeActiveIntervals() {
  if (progressUpdateInterval) {
    clearInterval(progressUpdateInterval);
    progressUpdateInterval = null;
  }
}

// ==========================================
// 8. DATA FILTERING LOGIC
// ==========================================

let activeTypeFilter = 'all'; 
let activeLengthFilter = 'all'; 
let activeFavouritesFilter = false;

const filterBindings = [
  { id: 'filter-all-type', type: 'type', value: 'all' },
  { id: 'filter-hymn', type: 'type', value: 'hymn' },
  { id: 'filter-anthem', type: 'type', value: 'anthem' },
  { id: 'filter-all-len', type: 'length', value: 'all' },
  { id: 'filter-short', type: 'length', value: 'short' },
  { id: 'filter-long', type: 'length', value: 'long' }
];

filterBindings.forEach(binding => {
  const btn = document.getElementById(binding.id);
  if (btn) {
    btn.addEventListener('click', () => {
      btn.parentElement.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      
      if (binding.type === 'type') activeTypeFilter = binding.value;
      if (binding.type === 'length') activeLengthFilter = binding.value;
      
      executeCompoundFiltering();
    });
  }
});

const favouritesFilterGroup = document.getElementById('favourites-filter-group');
if (favouritesFilterGroup) {
  const favAccount = new UserAccount();
  if (favAccount.isLoggedIn()) {
    favouritesFilterGroup.innerHTML = `
      <span class="filter-label">SAVED:</span>
      <button class="btn filter-btn" id="filter-favourites">♥ My Favourites</button>
    `;
    const favouritesFilterBtn = document.getElementById('filter-favourites');
    favouritesFilterBtn.addEventListener('click', () => {
      activeFavouritesFilter = !activeFavouritesFilter;
      favouritesFilterBtn.classList.toggle('active', activeFavouritesFilter);
      executeCompoundFiltering();
    });
  } else {
    favouritesFilterGroup.innerHTML = `
      <span class="filter-label" style="width: auto;">
        <a href="login.html" style="color: var(--text-muted); font-size: 0.75rem; font-weight: 700; letter-spacing: 0.1em; text-decoration: none;">
          ♡ <span style="text-decoration: underline; text-underline-offset: 3px;">Sign in</span> to save and filter favourites
        </a>
      </span>
    `;
  }
}

function executeCompoundFiltering() {
  const searchInput = document.getElementById('search-input');
  const searchString = searchInput ? searchInput.value.toLowerCase().trim() : '';
  const account = new UserAccount();
  
  const filteredSongs = songsDatabase.filter(song => {
    const matchesText = song.title.toLowerCase().includes(searchString) || 
                        song.history.toLowerCase().includes(searchString);
                        
    const matchesType = (activeTypeFilter === 'all') || 
                        (song.type && song.type.toLowerCase() === activeTypeFilter);
                        
    let matchesLength = true;
    if (activeLengthFilter === 'short') matchesLength = (song.durationInSeconds < 180);
    if (activeLengthFilter === 'long') matchesLength = (song.durationInSeconds >= 180);

    const matchesFavourites = !activeFavouritesFilter || account.isFavourited(song.id);
    
    return matchesText && matchesType && matchesLength && matchesFavourites;
  });

  if (filteredSongs.length === 0 && notificationEngine) {
    notificationEngine.error('No matching tracks found in filter matrices.');
  }

  renderSongCatalogue(filteredSongs);
}

// ==========================================
// 9. LIVE SEARCH SUGGESTIONS
// ==========================================
function renderSearchSuggestions(searchString) {
  const dropdown = document.getElementById('suggestions-dropdown');
  if (!dropdown) return;

  dropdown.innerHTML = '';

  if (searchString.trim().length === 0) {
    dropdown.classList.add('hidden');
    return;
  }

  const matches = songsDatabase.filter(song =>
    song.title.toLowerCase().includes(searchString.toLowerCase())
  );

  if (matches.length === 0) {
    dropdown.classList.add('hidden');
    return;
  }

  matches.slice(0, 6).forEach(song => {
    const item = document.createElement('div');
    item.className = 'suggestion-item';

    const titleSpan = document.createElement('span');
    titleSpan.className = 'suggestion-title';
    titleSpan.textContent = song.title;

    const metaSpan = document.createElement('span');
    metaSpan.className = 'suggestion-meta';
    metaSpan.textContent = song.type;

    item.appendChild(titleSpan);
    item.appendChild(metaSpan);

    item.addEventListener('click', () => {
      window.location.href = `player.html?song=${song.id}`;
    });

    dropdown.appendChild(item);
  });

  dropdown.classList.remove('hidden');
}

document.addEventListener('click', (event) => {
  const dropdown = document.getElementById('suggestions-dropdown');
  const searchInput = document.getElementById('search-input');
  if (!dropdown || !searchInput) return;

  if (!dropdown.contains(event.target) && event.target !== searchInput) {
    dropdown.classList.add('hidden');
  }
});