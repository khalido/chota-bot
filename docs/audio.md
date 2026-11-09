# Audio on the box

PipeWire is the box's sound server, with WirePlumber as its session manager. Everything that plays sound goes through it: Spotify (Soloist, [`spotify.md`](spotify.md)) now, chota's chimes and spoken announcements later. ALSA stays underneath as the kernel driver.

**Status (8 Nov 2026):** working. PipeWire 1.4.2 and WirePlumber 0.5.8 run as ko's user services with linger; the MM3A is the default output; test sounds and Spotify (Soloist) play through it.

**Volume (KO, 8 Nov):** the rear knob and the PipeWire output both at 100%. Loud enough, not too loud, very clear. Music volume is Spotify's own (the app, or Soloist's `set_volume`); chota sets its own level per sound: **50–60% by default for tones and announcements** (KO, 8 Nov), set per stream so music and the output stay at 100%. Spotify's loudness normalisation is on by default; turning it off (Soloist's `audio.normalize_v2=false`, unverified) would make music a bit louder.

**Speaker: Moondrop MM3A, on USB (8 Nov).** Card 2 `MM3A` (`35d8:012e`, "BAB MOONDROP MM3A"), next to the two HDMI cards. It shows up only while its input is USB (white light); any other input removes it from USB, and switching back restores the default output and its volume by themselves. It connects at full speed (USB 1.1, so its UAC1 mode): 16- and 24-bit stereo at 44.1, 48, 88.2 and 96 kHz. **No hardware volume control**: ALSA lists only a channel map, so PipeWire sets the level in software and the rear knob is the ceiling. It also registers a HID "Consumer Control" input, but turning the knob sent no key events (60 s listen, 8 Nov).

## Why PipeWire

- It's what Linux moved to: it replaced PulseAudio and JACK, and Raspberry Pi OS's own desktop uses it.
- Several programs play at once (music, a chime, an announcement), mixed into one speaker. Plain ALSA gives the device to one program at a time.
- Soloist needs it (PulseAudio is its fallback, and its issue #15 is a PulseAudio bug).
- Bluetooth speakers work through it, if ever wanted.

## Packages

`pipewire-audio`: Debian's metapackage for PipeWire as the sound server. It is Raspberry Pi OS desktop's own set (`rpd-common` depends on `pipewire`, `pipewire-pulse`, `wireplumber`, `libspa-0.2-bluetooth`; checked on the Pi 8 Nov) plus `pipewire-alsa`, which routes programs that play straight to ALSA (`aplay`) through PipeWire instead of letting them grab the speaker. No desktop comes with it.

## One-time setup

`deploy/bootstrap.sh` does steps 1–4. To do them by hand, as KO (sudo):

1. `sudo apt update && sudo apt install -y pipewire-audio`
2. `id ko` shows `audio`; if not, `sudo usermod -aG audio ko`. A lingered session has no seat, so without the group WirePlumber sees no sound cards.
3. `sudo loginctl enable-linger ko`: ko's user services (PipeWire, Soloist) run from boot, with nobody logged in.

Then as ko over SSH:

4. `systemctl --user enable --now pipewire pipewire-pulse wireplumber` (harmless if Debian already enabled them).
5. With the speaker plugged in: `wpctl status`, then `wpctl set-default <id>` for it.

## The speaker

Checks for the first week with the MM3A:

- **Set the rear knob once** to the loudest the family should ever hear. Nothing on the Pi can go past it, which is the real "never too loud" guard; chota's `music.maxVolume` sits below that.
- **Sleep and wake:** it has auto-standby, and one owner says it doesn't reliably wake on signal (optical). USB stayed connected through a 13.5-hour idle night (8–9 Nov). A clip played from a closed device after about 95 minutes idle came out clear (9 Nov); waking from a full night is untested.
- **No keep-awake (KO, 9 Nov):** removed the WirePlumber rule that set `session.suspend-timeout-seconds = 0`. It kept PipeWire sending silence over USB after the first play, so the speaker could never idle. PipeWire now closes the device a few seconds after each sound. If the start of a sound gets lost, try a keep-awake signal every 5 minutes or so.
- **Its own chime:** it plays a loud tone on power-on and input change, with no setting found to turn it off. Note whether waking from standby plays it.
- A pop on USB track changes is reported; owners keep a silent stream playing, which fights the auto-standby.

## chota playing sound

`chota.service` is a system unit running as ko. When chota itself plays sound, it needs `Environment=XDG_RUNTIME_DIR=/run/user/<ko's uid>` (check `id -u ko`) to reach ko's PipeWire. Not needed yet: chota plays nothing today.

## Checking it

- `wpctl status`: outputs, the default (marked `*`), and what's playing.
- `pw-play /usr/share/sounds/alsa/Front_Center.wav`, or `speaker-test -c 2 -t wav -l 1` through `pipewire-alsa`.
- `systemctl --user status pipewire wireplumber`; `journalctl --user -u wireplumber`.

## Speaking (built 8 Nov, not deployed)

- **`$lib/server/speech.ts`:** `speak(text, { mood?, chime? })`. `generateSpeech` through AI Gateway (`speech.model`, `speech.voice`, and `speech.style` plus the call's `mood` as `instructions`), WAV only, kept under `data/speech/` by a hash of model, voice, directions and words (a fixed phrase is paid for once). Then the music pauses (Soloist's `interrupt`; `duck` once `home` has it), a two-note chime made in code wakes the speaker, `pw-play --volume <speech.volume>` plays the clip, and the music resumes. One thing at a time; refuses in `speech.quietHours`. Logs the model's `warnings`, which is where a model says it ignored the voice or the style. chota is a system service, so `play()` points PipeWire at ko's session (`XDG_RUNTIME_DIR=/run/user/<uid>`) itself.
- **`announce` agent tool** (`agent/tools/speech.ts`): "tell the kids dinner's ready". The agent writes the exact words in its own voice, with an optional mood. Only `speech.announcers` when set, never on a quiet group turn, at most `speech.perHour` an hour.
- **Deterministic announcements:** a job calls `speak()` with fixed or templated text; no model writes the line.
- **Personality** comes in twice: the words (the soul, for the agent's lines) and the delivery (`speech.style`, which Gemini TTS and similar take as plain-language direction; models that don't just read the words).
- **Voices heard on the MM3A (8 Nov):** the same line from Gemini 3.8 Flash TTS (`Kore`), ElevenLabs v3, Microsoft MAI Voice 2.1 Flash and OpenAI tts-1, all WAV through the gateway, 1.8–5.3 s to make. KO: "good stuff"; model and voice to be tuned. The example config uses Gemini with `Kore`.

## Later: announcements from the calendar

Not built. KO, 8 Nov: calendar events announced at home in chota's own voice and mood, e.g. "Volleyball's at 5:30, so leave by 4:45".

- **Speech:** built, above. The AI SDK also has `experimental_streamSpeech` if a long line's wait ever matters. Speech models on the gateway (8 Nov): ElevenLabs (flash v2.5, v3, v4), Google Gemini 3.8 Flash and Flash Lite TTS, Microsoft MAI Voice, Mistral Voxtral, OpenAI tts-1, Fish Audio, Grok. A 150-character line costs about $0.002–0.003 on the per-character ones; Gemini is billed per audio token ($6–9 per million), roughly the same for a 10-second line if audio runs about 25–32 tokens a second (unchecked). `instructions` carries the mood ("warm, a bit rushed"); which models honour it is unchecked (Gemini TTS is steered by plain-language direction; ElevenLabs v3 uses inline tags, from memory). Try two or three voices on the real speaker before picking.
- **Flow:** a job every few minutes finds events with a lead time due (per event or kind: leave 45 min before volleyball) → one `generateText` call with the soul, the day (weather, how busy, what's next) and the event writes the line plus a delivery note → `generateSpeech` → play it: Spotify's `interrupt` pauses the music, the clip plays through PipeWire (or Cast's `announce` on the Nest Hub), and the music resumes.
- **Timing:** a 5-minute check plans what's due in the next window and sets an exact timer for each, so a 4:45 reminder says 4:45, not up to 5 minutes late. The scheduler's `protect` already stops a check running over the previous one.
- **Needs:** a per-day cap and an off switch per person (quiet hours and the chime are in `speak()`).

## Who sets which volume (KO, 9 Nov)

- **Rear knob and Pi output:** fixed at 100%. Nothing changes them.
- **Spotify:** one level, set only through Soloist (`set_volume`), the same number as the phone's slider. Don't use `wpctl` or `pw-cli` for it.
- **chota's own sounds:** each sets its own level on its own stream and doesn't save it.

## Volume leaks between streams (found 9 Nov)

WirePlumber saves `volume` per `media.role` in `~/.local/state/wireplumber/stream-properties`. `pw-play` defaults to role Music, the same as Soloist, so `pw-play --volume 0.38` left every later Spotify stream at 0.38 on top of its own level. `speak()` passes `-P '{ state.restore-props = false }'` so its level isn't saved (checked on the Pi with a silent clip, 9 Nov). Pass the same for any test `pw-play --volume`. To undo a saved level on a playing stream: `pw-cli s <stream id> Props '{ volume: 1.0 }'`.

WirePlumber also saves the stream's `channelVolumes`, which is Spotify's own level, and a new stream starts there. That fits Soloist's first play coming in at the last level (100, then 56; issue #23). Config can't start each play at a fixed level: WirePlumber applies `node.stream.default-playback-volume` only when restoring and only with nothing saved, and turning restore off skips it. Use Soloist's `set_volume` once it reports active.

## Speed (measured 9 Nov)

The SDK's `speed` option, 1.2 against 1.0, one run each on default voices. Honoured: `spacexai/grok-tts` and `openai/tts-1-hd` (1.19× shorter), `microsoft/mai-voice-2.1` (1.17×), `openai/tts-1` and `fish-audio/s2.1-pro` (1.13×), `elevenlabs/eleven-multilingual-v2` and `microsoft/mai-voice-2.1-flash` (1.3×), `elevenlabs/eleven-flash-v2.5` (1.43×). No effect: Gemini TTS and `eleven-v4` (a warning says ignored), `eleven-v3` and `eleven-v4-turbo` (no warning). `voxtral-mini-tts-3` needs a voice; untested. On Gemini, pace comes only from the style wording, and it overshoots: "slightly quicker" cut a 12.7 s clip to about 7.5 s.

## How fast (measured 8 Nov)

Two short replies (about 3–4 s of speech each), through AI Gateway from the Mac, WAV, not streamed:

| Model                                    | Line 1 | Line 2 | Use                             |
| :--------------------------------------- | :----- | :----- | :------------------------------ |
| `elevenlabs/eleven-flash-v2.5`           | 1.0 s  | 0.4 s  | replies a person is waiting for |
| `elevenlabs/eleven-v4-turbo`             | 0.8 s  | 0.7 s  | replies                         |
| `microsoft/mai-voice-2.1-flash`          | 1.7 s  | 0.5 s  | replies                         |
| `openai/tts-1`                           | 1.7 s  | 2.2 s  |                                 |
| `google/gemini-3.8-flash-lite-tts`       | 2.4 s  | 1.9 s  | announcements with a mood       |
| `google/gemini-3.8-flash-tts`            | 4.2 s  | 2.5 s  | announcements, best acting      |
| **Piper `en_GB-alba-medium`, on the Pi** | 0.41 s | 0.31 s | offline fallback                |

Piper on the Pi 5 (piper-tts 1.8.0 in a temporary venv, 8 Nov): 10× faster than real time once loaded, but loading the voice takes 3.1 s, so it has to stay loaded (its HTTP server as a user service); 227 MB peak RAM. Plainer voice, no tone control, no Australian voice, GPL-3.0 (fine as its own process). That makes it a real fallback for when the internet or the gateway is down.

**Gemini TTS (Google's 3.8 docs, read 8 Nov):** the text is read verbatim, so directions go in the style (`instructions` through the SDK), not the text. Keep the style short and reuse it; Google says long "director's notes" make the voice drift, and accents belong in the voice choice, not the style. Inline tags in the text work: `<short pause>`, `<long pause>`, `<chuckle>`, `<sigh>`, `<whispers>`; CAPITALS for emphasis. Each voice has a character: Kore firm, Sulafat warm, Achird friendly, Puck and Laomedeia upbeat, Vindemiatrix gentle, Callirrhoe and Umbriel easy-going, Gacrux mature. Output is 24 kHz mono WAV. Streaming exists (raw PCM chunks). An Australian accent isn't confirmed for 3.8.

## Local voices (researched 8 Nov, not adopted)

Only Piper (OHF-Voice/piper1-gpl 1.8.0, GPL-3.0, run as its own HTTP process) is fast enough on a Pi 5: about 0.4–1 s for a sentence (estimated from a published RTF of 0.12–0.14, not measured here), 20–65 MB a voice, no en-AU (en-GB is closest) and no tone control. Kokoro-82M sounds better but takes about 1 s to first audio, 2–5 s to finish and about 1 GB of RAM, too much beside Chromium and the app on 4 GB. Supertonic, Pocket-TTS and the billion-parameter models miss the bar. So chota stays on the gateway: lines cost about a quarter of a cent, take 2–5 s to make, carry the style directions, and fixed phrases are cached on disk after the first time. Revisit Piper as an offline fallback if the internet or the gateway being down ever matters.

The 2026 roundups (PromptQuorum and others) change nothing: they cite no Pi 5 measurements of their own and also pick Piper.

## Later: talking to chota (KO, 8 Nov)

Start with a button, a wake word later. The flow:

1. **Press TALK** (the board's hardware button, later "hey chota"). The light or the screen goes red: listening.
2. **Record** from the USB mic with `pw-record` (16 kHz mono) until the button is released, or a VAD hears the end.
3. **Transcribe** with the transcriber chota already uses (Gemini through AI Gateway). `plan.md`'s Groq Whisper is out of date. The AI SDK's `experimental_streamTranscribe` could transcribe while you're still talking, so the text is ready at release; worth measuring.
4. **The agent answers** as a `voice` channel, with the same tools and history. In voice mode it gives two things: one short spoken line, and the detail for the screen. For the screen, a `show` tool tells the board what to display, so "what's on the calendar" puts today's calendar up and zooms to the next slot.
5. **Speak and show at once:** the line goes through the fastest voice (ElevenLabs Flash, 0.4–1 s), the board renders the view. Announcements keep Gemini, where the mood matters more than the second.

Rough wait after release: transcription about 1 s, the agent 2–4 s (one tool call), speech 0.5–1 s, so 3–6 s, less if the reply starts speaking at its first sentence. Gemini's TTS mood is for announcements, where nobody is waiting.

## Later: "hey chota" (researched 8 Nov, not built)

- **Wake word:** livekit-wakeword (Apache-2.0, Feb 2026) has a first-party TypeScript package, `@livekit/wakeword`, on onnxruntime-node, so it runs inside chota with no Python service. Train "hey chota" once on the Mac (`uv tool install "livekit-wakeword[tflite]"`, then `train --type standard`; needs a free LiveKit Cloud project for the synthetic speech), copy the ~7 MB ONNX to the Pi, and feed it 80 ms frames from `pw-record --rate 16000 --channels 1 --format s16 -`. Published: 89–90% recall at 0.5–1 false alarms an hour, about 1 ms a frame, both on x86, not the Pi. Use "hey chota", not "chota": two syllables wake on more by mistake. Fallbacks: sherpa-onnx keyword spotting (no training, Node support for it unconfirmed), or openWakeWord as a Wyoming service with our own model (its pretrained models are non-commercial). Porcupine's free tier ended 30 Jun 2026.
- **After the wake word:** a VAD (Silero) finds the end of speech, then the clip goes to the transcriber chota already uses (Gemini through AI Gateway). Local speech-to-text on Pi 5-class cores takes 0.5–1.4 s for a 4 s command but 0.8–1.2 GB of RAM, too much beside the app.
- **Needs:** a USB mic, and a Pi 5 test of CPU, false wakes in the kitchen, and Bun loading onnxruntime-node.
