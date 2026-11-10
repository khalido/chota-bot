# Spotify

The box is a Spotify Connect speaker. Anyone in the house with Premium should be able to pick it in their Spotify app and play (Family-plan members untested); chota sees what's playing and can pause, skip, change the volume, play a favourite, or pause the music for an announcement and resume after. Lyrics are out of scope.

**Live on the Pi (8 Nov):** "Chota" shows in the Spotify app; KO played from his phone; `soloist ctl` changed the volume, paused and resumed that playback from the Pi. chota's own client isn't connected yet (`music` not in config, weekly update timer not enabled). Before that: On the Pi (8 Nov) the arm64 build runs: `soloist 1.3.10.51 build 1793988108 (20261106) (g19412df6ea) (linux/aarch64)`, glibc 2.41, no missing libraries; the archive holds `soloist`, `CHANGELOG.md` and `THIRD_PARTY_LICENSES.txt`. The key is on the Pi (step 5, done 8 Nov). Still needed: the audio setup in [`audio.md`](audio.md) (sudo), a USB speaker (the Pi has only HDMI audio), and an answer on avahi (step 3).

The client is `@khalido/home`'s `spotify` connector (since 10 Nov 2026, after it drove the real speaker on the Pi). chota's own Soloist client is gone; its wrapper is `src/lib/server/tools/music.ts`.

## Why Soloist

[Spotify Soloist](https://developer.spotify.com/documentation/soloist) is Spotify's own headless Connect client for Linux, with a local WebSocket API for state and control. Alternatives:

- **go-librespot**: unofficial, reverse-engineered, breaks when Spotify changes things. The fallback if Soloist doesn't work out.
- **Spotify Web API**: only for catalogue search (below). Soloist reports and controls its own session locally, so the Web API's player calls and their per-user sign-ins aren't needed.

## How it fits

- `deploy/soloist.service` runs Soloist as ko's systemd user unit, with the WebSocket API on `127.0.0.1:9091` (no auth, TLS or origin check, so loopback only).
- `src/lib/server/tools/music.ts` wraps the connector (env `SOLOIST_WS`, default `ws://127.0.0.1:9091`; the connector keeps the socket, reconnects, holds the volume to `music.maxVolume` and confirms each write). Offline is a normal state, never a crash, and boot doesn't wait for it. It has `nowPlaying()`, `play(link)`, `pause()`, `resume()`, `next()`, `prev()`, `setVolume(n)`, `queue(track)`, `duck(fn, to)` and `interrupt(fn)`; each write resolves `{ confirmed, now }`.
- **Music on another device is left alone.** Spotify plays on one device per account, and Soloist reports the account's playback even when it is on a phone or a Google speaker (`active: false`). `nowPlaying().here` says whether the box is the one playing. While it isn't, `pause`, `next`, `prev`, `setVolume` and `queue` are refused and nothing is sent; `resume` is refused while music is playing elsewhere. Two calls move the music to the box: `play(link)`, because someone asked for it there, and `resume` when nothing is playing anywhere, which carries on the paused session from the box even if it was paused on another speaker (seen live: a session paused on a Cast speaker resumed on the box). Whether `resume` should do that is KO's call. Checked on the real speaker, 10 Nov 2026, before the `duck` and `interrupt` checks were added; those two are tested against a fake socket only.
- Agent tools: `music_now`, `music_control`, `music_play` (a favourite, a Spotify link, or a search: "play Kiss from a Rose" plays the best match and names the alternatives).
- **Search** (`tools/spotify-web.ts`): our own small client for the Web API (Spotify's SDK has had no release since January 2024 and still calls removed playlist routes) on a dev-mode app's own keys (`SPOTIFY_CLIENT_ID`, `SPOTIFY_CLIENT_SECRET`; client credentials, so no user sign-in and no 5-user cap), Australian market, at most 10 results a type, tracks, albums, playlists, artists and podcasts (shows, episodes). Built against Spotify's OpenAPI spec (read 8 Nov): the agent can narrow a search with Spotify's filters (`track:`, `artist:`, `album:`, `year:` with ranges, `genre:`, `tag:new`); a 429 waits out a Retry-After of up to 10 s once; errors carry Spotify's own message; nothing found is cached, and replies say it's from Spotify (Developer Terms).
- **With someone's sign-in, later:** their own playlists (`GET /me/playlists`, scope `playlist-read-private`, not deprecated), liked songs, saved albums and recently played need Authorization Code with PKCE and a `http://127.0.0.1` redirect. That would let "play my Friday playlist" read the real playlists instead of `music.favourites`. Deprecated and not used: top tracks, related artists, recommendations, featured playlists, new releases, audio features. Checked live 8 Nov: "kiss from a rose" → Seal's track first, and Soloist played it. Search lives in chota, not `@khalido/home` (KO, 8 Nov: home is device control; finding music is the bot's). The Web Playback SDK isn't used: Soloist already makes the box a speaker.
- Config: `music` in `chota.config.ts`: `maxVolume` (requested volumes are held to it), `favourites` (word → Spotify link), `deviceName` (a label; keep it the same as `-n` in the unit).
- `/api/health` shows a `music` line: `offline`, `logged-out` or the speaker and its status. An expired build exits, so it shows as offline.

## One-time setup on the Pi

1. Create a Soloist API key at developer.spotify.com/dashboard/soloist (needs Premium).
2. Audio: PipeWire set up as in [`audio.md`](audio.md) (packages, `audio` group, linger, default output).
3. `ss -ulpn | grep 5353`: Soloist needs UDP 5353 for discovery, and on the Pi `avahi-daemon` holds it (checked 8 Nov). Issue #1 says that silences Soloist with no error. Try with avahi running first: if the speaker doesn't appear in the Spotify app, stop avahi (`sudo systemctl disable --now avahi-daemon avahi-daemon.socket`). That loses `chota.local`. `http://chota/` resolves through Tailscale (checked 8 Nov), so it keeps working.
4. Copy the units: `mkdir -p ~/.config/systemd/user && cp ~/code/chota-bot/deploy/soloist{.service,-update.service,-update.timer} ~/.config/systemd/user/ && systemctl --user daemon-reload`
5. Key: `mkdir -p ~/.config/soloist && echo 'SOLOIST_API_KEY=...' > ~/.config/soloist/env && chmod 600 ~/.config/soloist/env`
6. Install the binary and start it: `~/code/chota-bot/deploy/soloist-update.sh` (downloads from Spotify each time; we don't redistribute it).
7. `systemctl --user enable --now soloist soloist-update.timer`
8. Add `music` to `chota.config.ts` and deploy.
9. From a phone on the same Wi-Fi, open Spotify, pick "Chota" and play. `journalctl _SYSTEMD_USER_UNIT=soloist.service` (the user journal isn't kept on its own) should show the login and `client expires in N days`.

## Checking it

- `~/.local/bin/soloist ctl -D ~/.local/share/soloist status` shows whether it's running, its WebSocket and login state; `now --json` what's playing; `trace` every event as it happens.
- If the WebSocket port can't be bound, Soloist starts without it and only logs a warning: the unit looks healthy and chota shows `offline`. Check `journalctl --user -u soloist`.
- Re-pair (another account, or a broken session): `systemctl --user stop soloist`, then run `soloist --pair` with the same `-n`, `-k`, `-D`, which stores the new session and exits; start the service again. Two Soloists on one data dir: the second exits with code 1.
- The WebSocket has no origin check, so any web page open in a browser on the box (the print screenshots, the Sentral login) could send it commands. Harmless today (music control only); keep in mind before the box browses arbitrary pages.

## Builds expire

Each build stops working 90 days after it was built and exits with code 10. The unit doesn't restart on 10; `soloist-update.timer` runs `soloist-update.sh` weekly (and at boot if a week was missed), which installs a new build and restarts the speaker only when the version changed. New builds appeared about weekly in October and November 2026; Spotify's docs promise no cadence, so if they stop, the speaker stops at day 90. The restart cuts off anything playing.

## Verified vs not

Checked against the WebSocket API reference (8 Nov 2026): message and command names and fields, volume 0–100, position as epoch-ms timestamp plus speed. Unit tests cover state, events, interpolation, link conversion, the volume cap, interrupt and reconnect, against a fake socket.

Verified 8 Nov: pause and volume on playback a phone started (via `soloist ctl`); discovery with avahi running. Not verified: Family-plan members casting; whether `--version` keeps that format on later builds; the 100% first-play workaround on the real speaker.

## Open issues that matter

- [#23](https://github.com/spotify/soloist/issues/23): `-i` is ignored on PipeWire and the first play starts at 100%. chota lowers it to `maxVolume` within 10 s of an idle → playing change and logs it. Two live runs (9 Nov): the first play came in at the last level WirePlumber saved (100, then 56; `audio.md`), not always 100; `-i` defaults to 40, which is what shows until then.
- [#18](https://github.com/spotify/soloist/issues/18): a bad key logs `login failed` and keeps running. Health shows `logged-out`, which is also the normal state before anyone has picked the speaker in the Spotify app.
- [#1](https://github.com/spotify/soloist/issues/1): with UDP 5353 taken, the speaker advertises nothing and logs nothing.
- [#5](https://github.com/spotify/soloist/issues/5): playback can stall mid-track, most often the first track after idle, with no error on the WebSocket. chota would still report `playing`.
- [#15](https://github.com/spotify/soloist/issues/15): on PulseAudio output the next track is silent after a natural track end. Another reason to run real PipeWire, not the Pulse fallback.
- [#24](https://github.com/spotify/soloist/issues/24): the key is a CLI flag only, so it shows in `ps`.
- [#31](https://github.com/spotify/soloist/issues/31): downloads have no checksum or signature to verify.

Soloist doesn't say which Spotify account is playing, so chota can't tell who started the music.

## What Google's speakers do (read 8 Nov, for the next round)

From Google's "Listen to music on Google smart speakers and displays" help page:

- **How people ask:** "play [song]", "[song] by [artist]", "[song] from [album]", "[artist]", "music by [artist]", "[album] by [artist]", a genre, mood or activity ("happy music", "music for cooking"), "play some music" with no target, and "shuffle [album / artist / playlist]". chota's `music_play` covers song, artist and album by search type and filters; a genre, mood or activity should search playlists. Still to add: **"play some music"** (a `default` favourite, or the person's own playlists once they sign in) and **shuffle** (`setShuffle` in `home`'s connector; chota's own client has none).
- **Ambiguous requests:** Google doesn't ask back; it plays its best guess and tells people to be more specific. chota does the same, and names two alternatives.
- **Two volumes:** media and the assistant's voice are separate; at media volume 0 the assistant still speaks at 5%. chota's speech volume is already its own (per stream), so announcements are heard whatever the music is at.
- **Whose music:** each person links one account per service, and Voice Match decides whose library a request uses; without it, everyone gets the owner's. chota's equivalent is the asker it already knows from WhatsApp or Telegram, once each person signs in to Spotify. Until then all music runs on whoever picked the speaker.
- **Rooms:** "play on the bedroom speakers" and speaker groups. For chota that's Cast speakers through `home`, later.
