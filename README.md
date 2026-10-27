# I Love the 80's!

A Progressive Web App party game, a sibling of Back Track: an 80s hit plays and everyone tries to name the artist.

**Use it:** https://brian-borup.github.io/i-love-the-80s/

On an iPhone, open that link in Safari, tap **Share → Add to Home Screen**. It then runs full-screen. Games are saved only on the device.

## Playing

- **Pick the artist:** take turns. On your turn a mystery song plays and you pick the band or singer from four choices. A right answer scores a point. Most points after the last round wins.
- **Shout it out:** a song plays and everyone shouts out the artist. Tap **Reveal the artist**, then tap everyone who got it right. Each right answer scores a point.
- Play songs from all of the 80s, or just 1980–84 or 1985–89.

## Music

Each song plays as a 30-second preview clip from Apple, right in the app, with the artist, title and artwork hidden until the guesses are in. The lock screen and Control Center show it as "Mystery song". No account is needed, but it does need an internet connection. If Apple has no clip for a song, the app quietly swaps in another one.

## Songs

The song list lives in `tools/song-list.js` as `[year, title, artist]`, over a thousand songs by bands and solo artists. Spell each artist the same way every time, because the multiple-choice game offers other artists as wrong answers, and leave out duets credited to two names. After editing it, run:

```
node tools/resolve-ids.js
```

This looks up each song's Apple Music track id (so the app plays the original recording and not a cover) and rebuilds `songs.js`. Lookups are cached in `tools/ids-cache.json`, so only new songs are searched. Apple allows about 20 searches a minute, so a full rebuild takes about an hour. At the end the script lists songs it couldn't find and any years that look wrong.

If Apple credits an artist differently from how the game shows them, add Apple's name as a fourth field, e.g. `[1982, 'Jack & Diane', 'John Mellencamp', 'John Cougar']`. If the script picks the wrong recording, put the right track id in `tools/ids-cache.json`; it keeps it as long as the track name still matches the song.

## Icons

The icons are drawn by `tools/make-icons.ps1` (Windows):

```
pwsh tools/make-icons.ps1
```

## Developing

Plain HTML, CSS and JavaScript, no build step.

```
node serve.js
```

then open http://localhost:8083. When you change any app file, bump `CACHE` in `sw.js` so installed copies pick up the update.
