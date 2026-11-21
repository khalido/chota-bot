# How things work

The TV app plays isometric machine figures full screen, one after another: an engine firing, a toilet flushing, a lock taking the wrong key. Left and Right change machine. The figures come from the [Anatomy community gallery](https://skills.wheresryan.sh/anatomy/community) (repo `wheresryan22/anatomy-community`). Part of the Google TV app design: [`tv-app.md`](tv-app.md), slice 13. Not built.

Each figure is one self-contained HTML page: an isometric SVG drawing plus the script that moves it. I checked all 56 built pages on 19 Nov 2026, from the gallery's `previews` branch (built from `main` at `352c848`, 20 Oct).

## What the figures are like

| Question              | Finding                                                                                                                                                                                       |
| --------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Licence               | All 56 are MIT. A figure may be CC-BY-4.0 instead, which its `figure.json` says. Either way: ship the licence notice and show the author                                                      |
| Network               | None of the 56 loads anything. Each page works offline as it is                                                                                                                               |
| Size                  | 133 KB to 3.3 MB, median 350 KB; about 4.5× smaller compressed. All 56 come to 29 MB, the first 12 to about 5.5 MB (about 1.2 MB in the app bundle)                                           |
| Moves with no pointer | 45 of 56 run their own loop (an idle tour) the moment they load. Of the 11 that sit still, 7 are WebGL or 3D figures; the other 4 wait for a drag or a key                                    |
| Focus                 | Focusing a figure (to give it keys) doesn't stop its tour, except in 1 of 56                                                                                                                  |
| Keys                  | Every figure's own hint is for a mouse or a keyboard ("hover to slow", "Z / X jump", "drag the crank"). Many take Space; a few take Enter or arrows. The remote has neither Space nor letters |
| Shape                 | Drawings are portrait or square, about 650×600 to 760×1000 px, in a card with text below. Most pages are taller than a TV screen                                                              |
| Theme                 | The built pages are the light theme. 43 of 56 also have a dark page in their source, which the Anatomy kit rebuilds byte for byte                                                             |

So they work on a TV as a curated set. Watching is the main use, and 45 already run unprompted. Working a figure by remote is a bonus where it maps cleanly.

## How it works in the app

- **Bundled, not fetched.** A script pulls the chosen figures from the gallery at one pinned commit into `cast/public/figures/`, with the gallery's card image of each (for the picker) and a manifest: id, title, author, licence, source link, commit. No runtime calls, nothing to keep up.
- **Each figure runs in an iframe with `sandbox="allow-scripts"`.** It's other people's code, so it gets no access to the app's storage or the Capacitor bridge. The receiver's HTML screen can't show these: DOMPurify strips their scripts.
- **The fit is fixed at bundle time**, since the app can't reach inside a sandboxed frame. The script adds one stylesheet to each page: hide the hint line, legend and corner text (the gallery's own card script does the same with one rule over `.iso-plate`), and scale the drawing to the screen height. It uses the dark page where the source has one.
- **Remote:** Left and Right change machine, and the tour keeps playing. OK hands focus to the figure, and Back takes it back (Back is native, so it works from inside the frame). While a figure has focus, `MainActivity` sends OK as Space, which 7 of the first 12 use for their main action.
- **Screen:** the drawing at full height on the left. On the right: the title, the figure's own one-line caption and "Drawing by @author · MIT". A credits screen lists every figure with its licence text. Figures with only a light page sit on a dimmed card, so they don't light up a dark room.
- **Cycle mode (later):** after a set time with no key pressed, move to the next machine on its own, so the TV can sit on it like a screensaver.

## Which ones

Unbranded only: no Game Boy, NES, Walkman, Discman, Polaroid, Tamagotchi, BMW or Ford (Play's intellectual-property policy). Skip at first: the WebGL and 3D figures (heavier, and most don't move on their own), the developer ones (agent line, GitLab runner, debounce, quotum) and the two in Portuguese.

The first 12, all touring on load:

| Figure             | Page   | SVG elements | Dark page | OK (as Space) does   |
| ------------------ | ------ | ------------ | --------- | -------------------- |
| Four-stroke engine | 763 KB | 1,882        | yes       | nothing (hover only) |
| Flush toilet       | 210 KB | 740          | no        | flushes              |
| Click pen          | 419 KB | 2,445        | yes       | clicks the pen       |
| Pin tumbler lock   | 258 KB | 1,363        | no        | pauses the tour      |
| Zipper             | 396 KB | 1,236        | yes       | nothing (click only) |
| Geneva drive       | 313 KB | 1,416        | no        | nothing (watch only) |
| Open differential  | 652 KB | 985          | no        | nothing (hover only) |
| Lever escapement   | 1.2 MB | 1,020        | no        | nothing (hover only) |
| Wankel engine      | 374 KB | 1,950        | yes       | spins it up          |
| Pop-up toaster     | 178 KB | 912          | yes       | pushes the lever     |
| Gumball machine    | 441 KB | 1,244        | yes       | turns the crank      |
| Film projector     | 236 KB | 692          | yes       | runs the film        |

Next in line: padlock, typewriter, Enigma, automatic watch, wind gauge, seat belt. The gallery keeps growing; re-run the census when bumping the pinned commit.

## First test

Two simple, family-friendly figures on the real TV, inside the slice 1 spike app:

- **Flush toilet** (210 KB, 740 elements). Kids get it at once, and OK flushes it. Light page only, so it also tests the dimmed card.
- **Pop-up toaster** (178 KB, 912 elements). OK pushes the lever. Has a dark page.

Both are among the smallest. Check:

1. They move on their own.
2. They hold their frame rate.
3. They fit a 1080p screen once the stylesheet is added.
4. OK, sent as Space, works the toilet and the toaster.
5. Back gets out of the frame.

If they pass, try the click pen (2,445 elements, the heaviest of the 12) for the worst case.

## Cost

M, about 3–4 days:

1. The fetch script with its stylesheet and manifest (a day).
2. The picker and player screen with its keys (a day).
3. Checking each candidate on the Streamer for frame rate and fit (half a day).
4. The credits screen (half a day).

Frame rate is the risk: these figures move 700–2,400 SVG elements per frame. That holds 60 fps on a Mac and is untested on the Streamer, so the first test (above) runs it on the Streamer.

## Open

- **Bundle these, or draw your own** with the iso-figures skill (decision 9 in `tv-app.md`). Drawing your own means sourcing each machine from photos, about an hour of agent time per figure plus review. Mixing the two works later.
- **Ask the gallery's author** whether a TV app showing the figures is welcome. MIT doesn't require it; it's a courtesy, and might get a link back.
