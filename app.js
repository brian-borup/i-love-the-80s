'use strict';

const STORAGE_KEY = 'i-love-the-80s:v1';

const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => [...document.querySelectorAll(sel)];

const els = {
  setupScreen: $('#setupScreen'),
  playScreen: $('#playScreen'),
  winScreen: $('#winScreen'),
  resumeBtn: $('#resumeBtn'),
  playerList: $('#playerList'),
  addPlayerForm: $('#addPlayerForm'),
  newPlayer: $('#newPlayer'),
  modeHelp: $('#modeHelp'),
  lengthLabel: $('#lengthLabel'),
  lengthGroup: $('#lengthGroup'),
  songCount: $('#songCount'),
  startBtn: $('#startBtn'),
  howBtn: $('#howBtn'),
  howDialog: $('#howDialog'),
  quitBtn: $('#quitBtn'),
  confirmDialog: $('#confirmDialog'),
  roundLabel: $('#roundLabel'),
  scoreboard: $('#scoreboard'),
  turnLabel: $('#turnLabel'),
  songCard: $('#songCard'),
  cassette: $('#cassette'),
  tapeLabel: $('#tapeLabel'),
  art: $('#art'),
  songArtist: $('#songArtist'),
  songTitle: $('#songTitle'),
  songYear: $('#songYear'),
  playBtn: $('#playBtn'),
  progressBar: $('#progressBar'),
  playerNote: $('#playerNote'),
  choicePanel: $('#choicePanel'),
  choiceTitle: $('#choiceTitle'),
  choices: $('#choices'),
  shoutPanel: $('#shoutPanel'),
  shoutTitle: $('#shoutTitle'),
  shoutList: $('#shoutList'),
  resultLabel: $('#resultLabel'),
  lockBtn: $('#lockBtn'),
  nextBtn: $('#nextBtn'),
  winnerName: $('#winnerName'),
  winnerNote: $('#winnerNote'),
  standings: $('#standings'),
  againBtn: $('#againBtn'),
  newGameBtn: $('#newGameBtn'),
  audio: $('#audio'),
};

// ---- Songs ----
// SONGS (from songs.js) is a list of [year, title, artist, appleTrackId].

const song = (i) => {
  const [year, title, artist, id] = SONGS[i];
  return { year, title, artist, id };
};
const ARTISTS = [...new Set(SONGS.map((s) => s[2]))];

const ERAS = { all: [1980, 1989], early: [1980, 1984], late: [1985, 1989] };

// Pick the artist: rounds each player gets. Shout it out: songs in the game.
const LENGTHS = { choice: [5, 10, 20], shout: [10, 20, 30] };

const MODE_HELP = {
  choice: 'Take turns picking the artist from four choices. One point for each right answer.',
  shout: 'Everyone shouts out the artist. Reveal it, then tap who got it right.',
};

// ---- State ----
// settings: { players: [name], mode: 'choice' | 'shout', length: { choice, shout }, era }
// game (while playing): {
//   mode, target, players: [{ name, score, missed }],
//   deck: [songIndex], turn, round, current: songIndex,
//   phase: 'guess' | 'reveal', options: [artist], pick, right: [bool], result, over }

function loadState() {
  const fresh = {
    settings: { players: [], mode: 'choice', length: { choice: 10, shout: 20 }, era: 'all' },
    game: null,
  };
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (saved && saved.settings) {
      const settings = { ...fresh.settings, ...saved.settings };
      // A length that's no longer offered goes back to the default.
      for (const mode of Object.keys(LENGTHS)) {
        if (!LENGTHS[mode].includes(settings.length[mode])) settings.length[mode] = fresh.settings.length[mode];
      }
      return { ...fresh, ...saved, settings };
    }
  } catch { /* fall through to a fresh state */ }
  return fresh;
}

let state = loadState();

function save() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch { /* storage full or unavailable; keep running in memory */ }
}

const shuffle = (list) => {
  for (let i = list.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [list[i], list[j]] = [list[j], list[i]];
  }
  return list;
};

function songsInRange() {
  const [from, to] = ERAS[state.settings.era];
  return SONGS.map((_, i) => i).filter((i) => SONGS[i][0] >= from && SONGS[i][0] <= to);
}

// The right artist plus three others, in random order.
function artistOptions(i) {
  const artist = SONGS[i][2];
  const others = shuffle(ARTISTS.filter((b) => b !== artist)).slice(0, 3);
  return shuffle([artist, ...others]);
}

// ---- Music ----
// Each song's preview clip and artwork come from the iTunes lookup API,
// fetched once and remembered for the session.

const media = new Map();
// The same results once they've arrived, so a tap can use them without waiting.
const ready = new Map();

function getMedia(i) {
  if (!media.has(i)) {
    const request = fetch(`https://itunes.apple.com/lookup?country=US&entity=song&id=${song(i).id}`)
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error(`HTTP ${res.status}`))))
      .then((data) => {
        const hit = data.results.find((r) => r.kind === 'song') || {};
        const m = {
          preview: hit.previewUrl || '',
          art: hit.artworkUrl100 ? hit.artworkUrl100.replace('100x100', '300x300') : '',
        };
        ready.set(i, m);
        return m;
      });
    request.catch(() => media.delete(i)); // let a later attempt retry
    media.set(i, request);
  }
  return media.get(i);
}

function stopAudio() {
  els.audio.pause();
  els.audio.removeAttribute('src');
  els.audio.load();
  els.playBtn.classList.remove('playing', 'loading');
  els.cassette.classList.remove('playing');
  els.progressBar.style.width = '0';
}

// How many songs in a row may be skipped before we assume the connection is
// down, rather than working through the whole deck.
const MAX_SKIPS = 5;
let skips = 0;

// When a song's clip can't be played, quietly swap in another song. Only
// while guessing: once revealed, the song has already been scored.
function skipSong() {
  const game = state.game;
  if (game.phase === 'guess' && game.deck.length && skips < MAX_SKIPS) {
    skips++;
    game.current = game.deck.pop();
    game.options = artistOptions(game.current);
    game.pick = null;
    save();
    renderPlay();
    loadCurrentSong();
    return;
  }
  autoplay = false;
  els.playBtn.classList.remove('loading');
  els.playerNote.textContent = 'Couldn\'t load a song. Check your connection and tap play to try again.';
}

// True from tapping Next song until the new song starts, so it plays without
// another tap.
let autoplay = false;

function startPlayback() {
  els.audio.play().catch(() => {
    els.playerNote.textContent = 'Tap play to start the music.';
  });
  autoplay = false;
}

// Load the current song so the play button can start it straight away (iOS
// only allows audio to start directly from a tap).
function loadCurrentSong() {
  const game = state.game;
  const i = game.current;
  stopAudio();
  els.playerNote.textContent = '';

  const use = (m) => {
    els.playBtn.classList.remove('loading');
    els.audio.src = m.preview;
    if (autoplay) startPlayback();
    if (game.phase === 'reveal' && m.art) showArt(m.art);
  };

  // Usually the clip was fetched ahead of time: use it right away, while
  // we're still inside the tap that got us here.
  const known = ready.get(i);
  if (known && known.preview) {
    use(known);
    if (game.deck.length) getMedia(game.deck[game.deck.length - 1]).catch(() => {});
    return;
  }

  els.playBtn.classList.add('loading');
  getMedia(i).then((m) => {
    if (state.game !== game || game.current !== i) return;
    if (!m.preview) { skipSong(); return; }
    use(m);
  }).catch(() => {
    if (state.game !== game || game.current !== i) return;
    skipSong();
  });

  // Fetch the next song too so it's ready when the turn changes.
  if (game.deck.length) getMedia(game.deck[game.deck.length - 1]).catch(() => {});
}

function showArt(src) {
  els.art.src = src;
  els.art.hidden = false;
}

els.playBtn.addEventListener('click', () => {
  const audio = els.audio;
  if (!audio.getAttribute('src')) { skips = 0; loadCurrentSong(); return; }
  if (audio.paused) audio.play().catch(() => { els.playerNote.textContent = 'Tap play again to start the music.'; });
  else audio.pause();
});

els.audio.addEventListener('play', () => {
  // Keep the lock screen and Control Center from giving the artist away.
  if ('mediaSession' in navigator && window.MediaMetadata) {
    navigator.mediaSession.metadata = new MediaMetadata({ title: 'Mystery song', artist: "I Love the 80's" });
  }
  els.playBtn.classList.add('playing');
  els.cassette.classList.add('playing');
  els.playerNote.textContent = '';
});
// The clip loaded fine, so the connection is working.
els.audio.addEventListener('loadedmetadata', () => { skips = 0; });
// The clip itself is broken or missing.
els.audio.addEventListener('error', () => {
  if (els.audio.getAttribute('src')) skipSong();
});
els.audio.addEventListener('pause', () => {
  els.playBtn.classList.remove('playing');
  els.cassette.classList.remove('playing');
});
els.audio.addEventListener('timeupdate', () => {
  const { currentTime, duration } = els.audio;
  els.progressBar.style.width = duration ? `${(currentTime / duration) * 100}%` : '0';
});

// ---- Setup screen ----

function show(screen) {
  for (const s of [els.setupScreen, els.playScreen, els.winScreen]) s.hidden = s !== screen;
  window.scrollTo(0, 0);
}

function renderSetup() {
  const { settings } = state;

  els.playerList.replaceChildren(...settings.players.map((name, i) => {
    const li = document.createElement('li');
    li.textContent = name;
    const remove = document.createElement('button');
    remove.type = 'button';
    remove.textContent = '✕';
    remove.setAttribute('aria-label', `Remove ${name}`);
    remove.addEventListener('click', () => {
      settings.players.splice(i, 1);
      save();
      renderSetup();
    });
    li.append(remove);
    return li;
  }));

  for (const b of $$('[data-mode]')) b.setAttribute('aria-pressed', String(b.dataset.mode === settings.mode));
  els.modeHelp.textContent = MODE_HELP[settings.mode];
  els.lengthLabel.textContent = settings.mode === 'choice' ? 'Rounds each' : 'Songs';
  els.lengthGroup.replaceChildren(...LENGTHS[settings.mode].map((n) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = n;
    b.setAttribute('aria-pressed', String(settings.length[settings.mode] === n));
    b.addEventListener('click', () => {
      settings.length[settings.mode] = n;
      save();
      renderSetup();
    });
    return b;
  }));

  for (const b of $$('[data-era]')) b.setAttribute('aria-pressed', String(b.dataset.era === settings.era));

  const count = songsInRange().length;
  const needed = neededSongs();
  const [from, to] = ERAS[settings.era];
  els.songCount.textContent = `${count} songs from ${from} to ${to}.`
    + (count < needed ? ` That's not enough for this game; pick fewer rounds or more years.` : '');
  els.startBtn.disabled = settings.players.length === 0 || count < needed;

  els.resumeBtn.hidden = !(state.game && !state.game.over);
}

function neededSongs() {
  const { settings } = state;
  const players = Math.max(1, settings.players.length);
  return settings.mode === 'choice' ? players * settings.length.choice : settings.length.shout;
}

els.addPlayerForm.addEventListener('submit', (e) => {
  e.preventDefault();
  const name = els.newPlayer.value.trim();
  if (!name) return;
  state.settings.players.push(name);
  els.newPlayer.value = '';
  save();
  renderSetup();
});

for (const b of $$('[data-mode]')) {
  b.addEventListener('click', () => {
    state.settings.mode = b.dataset.mode;
    save();
    renderSetup();
  });
}

for (const b of $$('[data-era]')) {
  b.addEventListener('click', () => {
    state.settings.era = b.dataset.era;
    save();
    renderSetup();
  });
}

els.howBtn.addEventListener('click', () => els.howDialog.showModal());
els.startBtn.addEventListener('click', startGame);
els.resumeBtn.addEventListener('click', () => {
  show(els.playScreen);
  renderPlay();
  loadCurrentSong();
});

// ---- Game ----

function startGame() {
  const { settings } = state;
  const deck = shuffle(songsInRange());
  const current = deck.pop();
  state.game = {
    mode: settings.mode,
    target: settings.length[settings.mode],
    players: settings.players.map((name) => ({ name, score: 0, missed: 0 })),
    deck,
    turn: 0,
    round: 1,
    current,
    phase: 'guess',
    options: artistOptions(current),
    pick: null,
    right: settings.players.map(() => false),
    result: null,
    over: false,
  };
  save();
  show(els.playScreen);
  renderPlay();
  loadCurrentSong();
}

function renderPlay() {
  const game = state.game;
  const current = game.players[game.turn];
  const s = song(game.current);
  const revealed = game.phase === 'reveal';

  els.roundLabel.textContent = `Round ${game.round} of ${game.target}`;

  els.scoreboard.replaceChildren(...game.players.map((p, i) => {
    const li = document.createElement('li');
    if (game.mode === 'choice' && i === game.turn) li.className = 'current';
    const name = document.createElement('span');
    name.textContent = p.name;
    const pts = document.createElement('span');
    pts.className = 'pts';
    pts.textContent = p.score;
    li.append(name, pts);
    if (p.missed) {
      const missed = document.createElement('span');
      missed.className = 'missed';
      missed.textContent = `✕${p.missed}`;
      missed.setAttribute('aria-label', `${p.missed} missed`);
      li.append(missed);
    }
    return li;
  }));

  els.turnLabel.textContent = game.mode === 'choice'
    ? (game.players.length > 1 ? `${current.name}'s turn` : 'Your turn')
    : 'Everyone shout it out!';

  els.songCard.classList.toggle('revealed', revealed);
  els.tapeLabel.textContent = revealed ? s.artist : 'Mystery Mix';
  els.songArtist.textContent = revealed ? s.artist : '???';
  els.songTitle.textContent = revealed ? `“${s.title}”` : "Who's the artist?";
  els.songYear.textContent = revealed ? s.year : '';
  if (!revealed) els.art.hidden = true;

  els.choicePanel.hidden = game.mode !== 'choice';
  els.shoutPanel.hidden = game.mode !== 'shout' || !revealed;
  if (game.mode === 'choice') renderChoices(s, revealed);
  else if (revealed) renderShout();

  els.resultLabel.hidden = !(revealed && game.result);
  if (revealed && game.result) {
    els.resultLabel.textContent = game.result.text;
    els.resultLabel.className = `result ${game.result.good ? 'good' : 'bad'}`;
  }

  els.lockBtn.hidden = revealed;
  els.lockBtn.textContent = game.mode === 'choice' ? 'Lock it in' : 'Reveal the artist';
  els.lockBtn.disabled = game.mode === 'choice' && game.pick === null;
  els.nextBtn.hidden = !revealed;
  els.nextBtn.textContent = isGameOver() ? 'See the winner' : 'Next song';
}

function renderChoices(s, revealed) {
  const game = state.game;
  els.choiceTitle.textContent = revealed ? 'The artist was…' : 'Who is this?';
  els.choices.classList.toggle('locked', revealed);
  els.choices.replaceChildren(...game.options.map((artist, i) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'choice';
    b.textContent = artist;
    if (revealed) {
      b.disabled = true;
      if (artist === s.artist) b.classList.add('right');
      else if (i === game.pick) b.classList.add('wrong');
    } else {
      b.setAttribute('aria-pressed', String(game.pick === i));
      b.addEventListener('click', () => {
        game.pick = i;
        save();
        renderPlay();
      });
    }
    const li = document.createElement('li');
    li.append(b);
    return li;
  }));
}

function renderShout() {
  const game = state.game;
  els.shoutTitle.textContent = game.players.length > 1 ? 'Who got it right?' : 'Did you get it right?';
  els.shoutList.replaceChildren(...game.players.map((p, i) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'shout';
    b.setAttribute('aria-pressed', String(game.right[i]));
    const name = document.createElement('span');
    name.className = 'name';
    name.textContent = p.name;
    const mark = document.createElement('span');
    mark.className = 'mark';
    mark.textContent = game.right[i] ? '+1' : 'Missed it';
    b.append(name, mark);
    b.addEventListener('click', () => {
      game.right[i] = !game.right[i];
      save();
      renderPlay();
    });
    const li = document.createElement('li');
    li.append(b);
    return li;
  }));
}

els.lockBtn.addEventListener('click', () => {
  const game = state.game;
  const s = song(game.current);
  if (game.mode === 'choice') {
    const player = game.players[game.turn];
    const good = game.options[game.pick] === s.artist;
    if (good) player.score++;
    else player.missed = (player.missed || 0) + 1;
    game.result = { good, text: good ? 'Totally tubular! +1' : 'Bogus! Not that artist.' };
  } else {
    // Shout it out is scored when Next song is tapped, once everyone's marked.
    game.right = game.players.map(() => false);
    game.result = null;
  }
  game.phase = 'reveal';
  save();
  renderPlay();
  getMedia(game.current).then((m) => { if (state.game === game && m.art) showArt(m.art); }).catch(() => {});
});

// Add up a Shout it out round from who was marked right.
function scoreShout() {
  const game = state.game;
  game.players.forEach((p, i) => {
    if (game.right[i]) p.score++;
    else p.missed = (p.missed || 0) + 1;
  });
}

function isGameOver() {
  const game = state.game;
  if (game.deck.length === 0) return true;
  if (game.mode === 'choice') return game.round >= game.target && game.turn === game.players.length - 1;
  return game.round >= game.target;
}

els.nextBtn.addEventListener('click', () => {
  const game = state.game;
  if (game.mode === 'shout') scoreShout();
  if (isGameOver()) {
    game.over = true;
    save();
    stopAudio();
    renderWin();
    return;
  }
  if (game.mode === 'choice') {
    game.turn = (game.turn + 1) % game.players.length;
    if (game.turn === 0) game.round++;
  } else {
    game.round++;
  }
  game.current = game.deck.pop();
  game.options = artistOptions(game.current);
  game.phase = 'guess';
  game.pick = null;
  game.right = game.players.map(() => false);
  game.result = null;
  save();
  renderPlay();
  autoplay = true;
  loadCurrentSong();
  window.scrollTo(0, 0);
});

els.quitBtn.addEventListener('click', () => els.confirmDialog.showModal());
els.confirmDialog.addEventListener('close', () => {
  if (els.confirmDialog.returnValue !== 'ok') return;
  stopAudio();
  state.game = null;
  save();
  renderSetup();
  show(els.setupScreen);
});

// ---- Winner ----

function renderWin() {
  const game = state.game;
  const ranked = [...game.players].sort((a, b) => b.score - a.score);
  const best = ranked[0].score;
  const winners = ranked.filter((p) => p.score === best).map((p) => p.name);
  const unit = (n) => (n === 1 ? 'point' : 'points');

  els.winnerName.textContent = winners.length > 1 ? `It's a tie!` : game.players.length > 1 ? `${winners[0]} rules!` : 'Game over!';
  els.winnerNote.textContent = winners.length > 1 ? `${winners.join(' & ')} with ${best} ${unit(best)}` : `${best} ${unit(best)}`;
  els.standings.replaceChildren(...ranked.map((p) => {
    const li = document.createElement('li');
    const name = document.createElement('span');
    name.textContent = p.name;
    const pts = document.createElement('span');
    pts.className = 'pts';
    pts.textContent = `${p.score} ${unit(p.score)}`;
    const missed = document.createElement('span');
    missed.className = 'missed';
    missed.textContent = `${p.missed || 0} missed`;
    const right = document.createElement('span');
    right.className = 'standing-scores';
    right.append(pts, missed);
    li.append(name, right);
    return li;
  }));
  show(els.winScreen);
}

els.againBtn.addEventListener('click', startGame);
els.newGameBtn.addEventListener('click', () => {
  state.game = null;
  save();
  renderSetup();
  show(els.setupScreen);
});

// ---- Start up ----

renderSetup();
if (state.game && state.game.over) renderWin();
else show(els.setupScreen);

// ---- Offline support ----

if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').catch(() => { /* offline caching unavailable */ });
  });
}
