/* global Notyf */

// ==========================================
// 1. GLOBAL CORE ENVIRONMENT VARIABLES
// ==========================================

// I'm setting up my main variables here to keep track of the songs and the audio player state.
let songsDatabase = []; 
let notificationEngine;
let playbackHistoryStack = [];
const songCacheMap = new Map();

// This holds the actual HTML5 Audio object that plays my mp3s
let currentAudioElement = null; 
let currentActiveSongId = null;
let progressUpdateInterval = null;

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

  // Show a welcome toast if login-page.js left us a message
  // (only happens on the redirect from a successful login).
  const welcomeMessage = sessionStorage.getItem('welcome_message');
  if (welcomeMessage && notificationEngine) {
    notificationEngine.success(welcomeMessage);
    sessionStorage.removeItem('welcome_message');
  }

  // Fetching my JSON file so I have all my song data ready to go
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
      
      // I wrote this to check if I'm on the player page so it auto-loads the correct song
      const urlParams = new URLSearchParams(window.location.search);
      const requestedSongId = urlParams.get('song');
      
      if (requestedSongId && document.getElementById('player-container')) {
        // Validate the id from the URL BEFORE trying to stream it -
        // a user can freely edit ?song= in the address bar to
        // anything (a typo, an old id, pure garbage), so this can't
        // be trusted the same way an internal function call can.
        if (songCacheMap.has(requestedSongId)) {
          handleStreamSong(requestedSongId, true);
        } else {
          renderInvalidSongLink(requestedSongId);
        }
      }

      if (notificationEngine && !requestedSongId) {
        notificationEngine.success('Song database compiled instantly.');
      }
    })
    .catch(error => {
      console.error(error);
      // I'll need a fallback UI just in case the JSON fails to load
    });
    
  // I added a debounce here so the search doesn't lag if I type too fast
  const searchInput = document.getElementById('search-input');
  if (searchInput) {
    let debounceTimeoutPointer;
    searchInput.addEventListener('input', () => {
      clearTimeout(debounceTimeoutPointer);
      debounceTimeoutPointer = setTimeout(() => {
        executeCompoundFiltering(); 
      }, 250); 
    });
  }

  // If login/logout happens via the nav auth-widget while this
  // page is open, reload so the favourite hearts and the "My
  // Favourites" filter button correctly reflect the new state -
  // same pattern used on contact.html and login.html.
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
    const noResultsMessage = document.createElement('p');
    noResultsMessage.className = 'text-muted-fallback'; 
    noResultsMessage.textContent = 'No songstracks match search query.';
    container.appendChild(noResultsMessage);
    return;
  }

  // Logged-in state is checked once per render, not per card -
  // cheaper than asking on every single card, and the catalogue
  // re-renders on every filter/search change anyway, which keeps
  // this in sync naturally.
  const account = new UserAccount();
  const loggedIn = account.isLoggedIn();

  // Looping through my database to create the song cards dynamically
  songsArray.forEach(song => {
    const cardElement = document.createElement('div');
    cardElement.className = 'card';

    const cardTitle = document.createElement('h3');
    cardTitle.textContent = song.title;

    const cardP = document.createElement('p');
    cardP.textContent = song.history;

    // Favourite heart button - only rendered when logged in, since
    // there's nowhere to store a favourite for a guest.
    if (loggedIn) {
      const favouriteButton = document.createElement('button');
      favouriteButton.className = 'favourite-btn';
      const isFav = account.isFavourited(song.id);
      favouriteButton.classList.toggle('is-favourited', isFav);
      favouriteButton.innerHTML = isFav ? '♥' : '♡';
      favouriteButton.setAttribute('aria-label', isFav ? 'Remove from favourites' : 'Add to favourites');
      favouriteButton.addEventListener('click', (event) => {
        event.stopPropagation();
        try {
          const nowFavourited = account.toggleFavourite(song.id);
          favouriteButton.classList.toggle('is-favourited', nowFavourited);
          favouriteButton.innerHTML = nowFavourited ? '♥' : '♡';
          favouriteButton.setAttribute('aria-label', nowFavourited ? 'Remove from favourites' : 'Add to favourites');
          if (notificationEngine) {
            notificationEngine.success(nowFavourited ? `Added "${song.title}" to favourites` : `Removed "${song.title}" from favourites`);
          }
          // If the "My Favourites" filter is currently active and
          // a song just got un-favourited, it should disappear
          // from the visible list immediately rather than waiting
          // for the next unrelated re-render.
          if (activeFavouritesFilter && !nowFavourited) {
            executeCompoundFiltering();
          }
        } catch (error) {
          if (notificationEngine) notificationEngine.error('Could not update favourites.');
          console.error(error);
        }
      });
      cardElement.appendChild(favouriteButton);
    }

    const loadButton = document.createElement('button');
    loadButton.className = 'btn';
    loadButton.textContent = '⚙️ Play';
    
    // Clicking this sends the user to the player page with the song ID in the URL
    loadButton.addEventListener('click', () => {
      window.location.href = `player.html?song=${song.id}`;
    });

    cardElement.appendChild(cardTitle);
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
    // Guards against a stale/tampered id reaching this point via
    // any path (e.g. a corrupted history stack from previous()/
    // next()), not just the initial URL check - one single place
    // this function can never silently do nothing.
    renderInvalidSongLink(songId);
    return;
  }

  currentActiveSongId = songId;

  safelyPurgeActiveIntervals();
  
  // I have to make sure any currently playing song stops before I load a new one
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

  // This is the magic line that actually loads my audio file from the URL I provided in the JSON
  currentAudioElement = new Audio(activeSong.audioUrl);
  
  // I'm telling the audio to play immediately, but catching the error if the browser blocks autoplay
  currentAudioElement.play().then(() => {
    // Autoplay worked!
  }).catch((error) => {
    // The browser blocked it, so I'll let the user know they need to click play manually
    if (notificationEngine) {
      notificationEngine.error('Autoplay blocked by browser. Please press Play.');
    }
    const playBtn = document.querySelector('button.btn:nth-child(2)'); 
    if (playBtn) {
      playBtn.innerHTML = '▶️ Play';
      playBtn.style.background = 'linear-gradient(135deg, var(--accent-blue) 0%, #4f46e5 100%)';
    }
  });

  const playerBox = document.createElement('div');
  playerBox.className = 'player-box';

  const sourceIndicator = document.createElement('div');
  sourceIndicator.className = 'player-source';
  sourceIndicator.textContent = '📡 CUSTOM MULTIMEDIA STATION ACTIVATED';

  const trackTitle = document.createElement('h2');
  trackTitle.className = 'track-heading';
  trackTitle.textContent = activeSong.title;

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
  controlDashboard.style.background = '#0d1117';
  controlDashboard.style.borderRadius = '12px';
  controlDashboard.style.border = '1px solid var(--glass-border)';
  controlDashboard.style.padding = '20px';
  controlDashboard.style.margin = '20px 0';

  const buttonRow = document.createElement('div');
  buttonRow.style.display = 'flex';
  buttonRow.style.gap = '10px';
  buttonRow.style.justifyContent = 'center';
  buttonRow.style.marginBottom = '20px';

  const prevButton = document.createElement('button');
  prevButton.className = 'btn';
  prevButton.innerHTML = '⏮️ Previous';
  if (playbackHistoryStack.length <= 1) {
    prevButton.style.opacity = '0.3';
    prevButton.style.cursor = 'not-allowed';
  } else {
    prevButton.addEventListener('click', handleNavigationBackwards);
  }

  // I set up my custom play/pause toggle here to control the Audio element
  const playPauseButton = document.createElement('button');
  playPauseButton.className = 'btn';
  playPauseButton.style.background = 'linear-gradient(135deg, var(--brand-green) 0%, #059669 100%)';
  playPauseButton.innerHTML = '⏸️ Pause';
  playPauseButton.addEventListener('click', () => {
    if (currentAudioElement.paused) {
      currentAudioElement.play();
      playPauseButton.innerHTML = '⏸️ Pause';
      playPauseButton.style.background = 'linear-gradient(135deg, var(--brand-green) 0%, #059669 100%)';
    } else {
      currentAudioElement.pause();
      playPauseButton.innerHTML = '▶️ Play';
      playPauseButton.style.background = 'linear-gradient(135deg, var(--accent-blue) 0%, #4f46e5 100%)';
    }
  });

  const forwardButton = document.createElement('button');
  forwardButton.className = 'btn';
  forwardButton.innerHTML = 'Next ⏭️';
  forwardButton.addEventListener('click', handleNavigationForward);

  const downloadButton = document.createElement('a');
  downloadButton.className = 'btn';
  downloadButton.style.background = 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)';
  downloadButton.style.textDecoration = 'none';
  downloadButton.style.display = 'inline-flex';
  downloadButton.style.alignItems = 'center';
  downloadButton.href = activeSong.audioUrl;
  downloadButton.download = `${activeSong.title.replace(/\s+/g, '_')}_Practice_Track.mp3`;
  downloadButton.innerHTML = '📥 Download';
  downloadButton.addEventListener('click', () => {
    if (notificationEngine) notificationEngine.success('Downloading media file...');
  });

  const speedController = document.createElement('select');
  speedController.className = 'btn';
  speedController.style.background = 'rgba(255, 255, 255, 0.05)';
  speedController.style.border = '1px solid var(--glass-border)';
  speedController.style.color = '#ffffff';
  speedController.style.cursor = 'pointer';
  speedController.style.appearance = 'none'; 
  speedController.style.padding = '12px 20px';

  
  const speedOptions = [
    { value: 0.5, label: '0.5x (Slow)' },
    { value: 0.75, label: '0.75x' },
    { value: 1.0, label: '1x (Normal)' },
    { value: 1.25, label: '1.25x' },
    { value: 1.5, label: '1.5x (Fast)' }
  ];

  speedOptions.forEach(opt => {
    const optionElement = document.createElement('option');
    optionElement.value = opt.value;
    optionElement.textContent = opt.label;
    optionElement.style.background = '#111827'; 
    optionElement.style.color = '#ffffff';
    if (opt.value === 1.0) optionElement.selected = true;
    speedController.appendChild(optionElement);
  });

  speedController.addEventListener('change', (event) => {
    if (currentAudioElement) {
      const newSpeed = parseFloat(event.target.value);
      currentAudioElement.playbackRate = newSpeed;
      if (notificationEngine) {
        notificationEngine.success(`Playback speed set to ${newSpeed}x`);
      }
    }
  });

  buttonRow.appendChild(prevButton);
  buttonRow.appendChild(playPauseButton);
  buttonRow.appendChild(forwardButton);
  buttonRow.appendChild(downloadButton);
  buttonRow.appendChild(speedController);

  const timelineContainer = document.createElement('div');
  timelineContainer.style.display = 'flex';
  timelineContainer.style.alignItems = 'center';
  timelineContainer.style.gap = '12px';

  const currentTimeText = document.createElement('span');
  currentTimeText.style.fontSize = '0.8rem';
  currentTimeText.style.color = 'var(--text-muted)';
  currentTimeText.style.fontFamily = 'monospace';
  currentTimeText.textContent = '0:00';

  const timelineSlider = document.createElement('input');
  timelineSlider.type = 'range';
  timelineSlider.min = '0';
  timelineSlider.max = '100';
  timelineSlider.value = '0';
  timelineSlider.style.flex = '1';
  timelineSlider.style.cursor = 'pointer';
  timelineSlider.style.accentColor = 'var(--brand-green)';

  const totalTimeText = document.createElement('span');
  totalTimeText.style.fontSize = '0.8rem';
  totalTimeText.style.color = 'var(--text-muted)';
  totalTimeText.style.fontFamily = 'monospace';
  totalTimeText.textContent = '0:00';

  // I added an event listener so dragging the slider changes the song position
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
  playerBox.appendChild(lyricsModuleContainer);

  playerContainer.appendChild(playerBox);

  // This interval updates my progress bar math visually every quarter of a second
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

  // I put this here so the next song plays automatically when one finishes
  currentAudioElement.addEventListener('ended', () => {
    safelyPurgeActiveIntervals();
    handleNavigationForward();
  });
}

// ==========================================
// 5b. BROKEN / TAMPERED LINK HANDLING
// ==========================================
// If someone edits the ?song= URL param to an id that doesn't
// exist in the database (typo, old link, deleted song, or just
// pasted garbage), this renders a clear error state instead of
// leaving player-container blank with no explanation. Used both
// on initial page load and as a safety net inside
// handleStreamSong itself.
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
  backBtn.href = 'home.html'; // update this if your catalogue page has a different filename
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

  const currentDatabaseIndex = songsDatabase.findIndex(song => song.id === currentActiveSongId);
  let nextDatabaseIndex = currentDatabaseIndex + 1;
  
  if (nextDatabaseIndex >= songsDatabase.length) {
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
let activeFavouritesFilter = false; // true = "My Favourites" filter is on

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

// Render the favourites filter group based on login state.
// Logged in: show the "♥ My Favourites" toggle button.
// Logged out: show a polite prompt to log in instead of a
// dead label with nothing next to it.
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