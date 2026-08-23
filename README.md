Rathkeale College Song & Tradition Portal

A browser-based site for practicing school hymns and anthems — students can browse the song catalogue, stream audio tracks, learn lyrics (full view, line-by-line, or flashcards), save favourites, and manage their own account.

Features


🎵 Song catalogue with search, type filter (hymn/anthem), and length filter
▶️ Custom audio player with speed control, scrubbing, next/prev, and download
📖 Three lyrics learning modes: Full Lyrics, Line-by-Line, and Flashcards
👤 Account system: sign up, log in, change email/password, recover via security question
❤️ Per-user favourites, synced across the nav bar and catalogue
📬 Contact form that adapts based on login state


Requirements

Before you start, install:


Node.js (LTS version) — this includes npm automatically
Git — needed to clone the repository, and its terminal (Git Bash) can also be used to run the app


Once Node.js is installed, confirm it worked by running:

bashnode --version
npm --version

Both commands should print a version number.


⚠️ Important: All commands below must be run in Command Prompt or Git Bash.
Do not use PowerShell — it is not supported for this project and may block the setup scripts from running.



Setup Instructions

Run these commands in order, in Command Prompt or Git Bash:

1. Clone the repository

bashgit clone https://github.com/YOUR-USERNAME/YOUR-REPO-NAME.git

2. Move into the project folder

bashcd YOUR-REPO-NAME

3. Move into the app folder

bashcd app

4. Install dependencies

bashnpm install

5. Start the app

bashnpm start

Once it's running, open your browser and go to the address shown in the terminal (commonly http://localhost:3000).

To stop the app, go back to the terminal and press Ctrl + C.

First-Time Use

Two demo accounts are automatically created the first time you visit the Login page:

RoleID / InitialsPasswordStudent123456Demo123!Staff (admin)JSMDemo123!

You can also sign up for your own account. Accounts are saved to your browser's localStorage, so they persist between visits on the same browser only — they won't transfer to a different browser or device.

If your stored data gets into a broken state (e.g. from testing), use the "Reset Data" button on the Login page to wipe all accounts and restore the two demo accounts above. This is destructive and asks for confirmation first.

Project Structure

├── index.html              # Homepage / dashboard hub
├── songs.html               # Song catalogue
├── player.html                # Song player
├── about.html                   # About page
├── contact.html                   # Contact form
├── database.json                    # Song data (id, title, lyrics, audioUrl, etc.)
├── /audio                             # MP3 files referenced by database.json
├── style.css                            # Site styling
├── auth-widget.css                        # Auth widget styling
└── /js
    ├── types.js                             # Custom types + validation (Song, User, etc.)
    ├── auth.js                                # UserAccount class (signup/login/favourites)
    ├── App.js                                   # Catalogue rendering, filtering, player UI
    ├── player.js                                  # MusicPlayer class
    └── auth-widget.js                               # Shared nav-bar login widget

Troubleshooting


"npm is not recognized" / command not found: Node.js isn't installed correctly, or you're using PowerShell instead of Command Prompt/Git Bash. Re-check the Requirements section above.
Blank catalogue / no songs loading: Open the browser console (F12). If you see a network error, make sure database.json exists and the app is running via npm start (not opened as a file directly).
"Skipping invalid song" warning in console: Expected behaviour if an entry in database.json is missing a required field — that one song is skipped, the rest of the catalogue still loads. Check the warning for which song and field.
Audio won't play automatically: Some browsers block autoplay. If you see an "Autoplay blocked" message, press Play manually.
Logged in on one page but not another: Make sure you're using the same browser — accounts and sessions are stored per-browser via localStorage, not on a server.


Notes


This is a demo/coursework project. Account data is stored client-side only and isn't intended to hold real personal information — see the comments in auth.js for details.
Password hashing uses the browser's built-in SubtleCrypto API (SHA-256 with a per-user salt) as a simplified, deliberately-documented approach — a production system would use a dedicated server-side library instead.