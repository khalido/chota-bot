# Photo frames

A second screen somewhere else in the house, showing family photos plus a little of chota (today's calendar, the weather, a note). Chota on the Pi 5 decides what shows; the frame only displays it. Not built. Started 21 Oct 2026.

## Two ways

| | Frameo frame | Pico 2 W + small screen |
| --- | --- | --- |
| What | A$75 10.1" Android frame, 1280×800 IPS touch ([Amazon AU](https://www.amazon.com.au/1280x800-Touchscreen-Electronic-Auto-Rotate-Mountable/dp/B0F61WL5GD)) | The Pico we own, with a screen from the drawer or a new e-ink one |
| Shows | Photos, video clips, a live web page | One picture at a time that chota draws and the Pico fetches |
| Looks | A normal photo frame | Whatever we build: e-ink paper, a small LCD, a wooden case |
| Power | Its own plug | USB, or batteries for months with e-ink |
| Work | An evening if ADB works; a return if not | A weekend: MicroPython plus a chota route |

Do both, in that order: the Frameo for photos in the living room, a Pico e-ink screen later for a quiet panel elsewhere (by the door: bus, weather, who has sport).

## Frameo frame

Frameo is the app on most cheap 10.1" Wi-Fi frames. Under it is a stripped-down Android tablet with no battery, which is why it suits an always-on screen.

**What Frameo's ADB setting enables.** Frameo officially supports this: join the Beta Program, then turn on ADB Access under Settings → About. ADB is Android's debug link. It does not root the frame, but it gives a shell and app installs, which is all we need:

- Install apps: a current Android System WebView (the stock one is too old for modern pages) and a client app.
- Make that app the one that opens at boot, so Frameo's own app stays out of the way.
- Turn the screen on and off from chota on a schedule (`adb shell input keyevent`), and take screenshots to check what it shows.
- Over Wi-Fi: connect by USB once, run `adb tcpip 5555`, then `adb connect <frame-ip>:5555` from the Pi. Give the frame a fixed IP in the router. This resets on reboot unless the ADB setting is made persistent (the Immich Kiosk guide has the commands).

Frameo warns that ADB can brick the frame if misused. Stick to installing apps and settings.

**Most cheap Frameo frames run Android 6.0.1.** Wes Bos's [device index](https://github.com/wesbos/photo-frame-dashboard/blob/main/docs/devices.md) (Oct 2026): 28 of its rows are Android 6.0.1 (Allwinner A33 or Rockchip RK3126, 512 MB to 1 GB RAM, WebView 44 to 107), 8 are Android 8.1 (RK3326), 6 are Android 10 (Allwinner A133 and others), none are Android 7. Units built in 2026 still ship on 6.0.1. Frameo itself promises security updates to the end of 2028 for Android 6 to 8. The Amazon listing names neither the board nor the Android version.

**The browser depends on what turns up:**
- **Android 8.1 or 10: [kiFOSSk](https://github.com/ShinyDiscoBallsDev/kiFOSSk)** (MIT, F-Droid or `adb install`, v1.1.3 Oct 2026, one developer). A full-screen WebView for dashboards: it makes itself the home app so it opens at boot instead of Frameo, skips the lock screen, shows a waiting screen and retries when the Pi is down, and hides settings behind a long-press. Its minimum is Android 7 (minSdk 24).
- **Android 6.0.1: kiFOSSk won't install.** Use the [ImmichFrame](https://immichframe.dev/docs/getting-started/apps) client (Lucas's choice, tested on Android 6.0.1 10.1" frames) or Fully Kiosk 1.57.1, as in the [Immich Kiosk Frameo guide](https://docs.immichkiosk.app/misc/frameo/). The stock WebView is often too old; that guide swaps in WebView 106, which needs root and can break the Frameo app if it goes wrong ([ImmichFrame #495](https://github.com/immichFrame/ImmichFrame/discussions/495)). Check the swap in logcat, not just the version number: Android 6 can report 106 and still fail to render.
- Either way, keep `/frame` plain: server-rendered HTML and CSS, no client JavaScript needed, so a 2022 WebView (or older) draws it. That may avoid the WebView swap altogether.
- None of them turns the screen off at night; chota does that over ADB.

**Security.** Some firmware runs a vendor agent (AiMOR) that connects out to the maker's server and can run root commands ([Wes's notes](https://github.com/wesbos/photo-frame-dashboard/blob/main/docs/allwinner-a33-pf1007l.md)). Block the frame from the internet in the router, and treat its old WebView as unfit for anything but our own page on the home network.

**What others found.**
- [Lucas Costi](https://lucascosti.com/blog/2026/02/using-an-even-cheaper-android-thing-as-a-digital-photo-frame/): an A$70-ish Amazon Frameo frame, in Australia. He used ADB to update WebView and runs the ImmichFrame client against an Immich Kiosk server. Fully Kiosk Browser was too finicky on it (he couldn't get out of its menus). The frame is "decently responsive".
- [Wes Bos](https://wesbos.com/hacking-smart-photo-frames): rooted a Skylight and a cheap Amazon frame for a family dashboard, added a motion sensor to dim the screen. The same Amazon listing can ship different boards; Allwinner PF1007L boards took extra work. Use a USB-A to USB-C data cable: USB-C to USB-C gave no power or data.

**On arrival, before adding photos:**
1. Before it joins Wi-Fi, block it from the internet in the router (allow only the Pi).
2. Help → Support shows the Android version. Then join the Beta Program, turn on ADB Access, and from the Mac: `adb shell getprop ro.build.version.release`, `getprop ro.board.platform`, `dumpsys webviewupdate`, and RAM from `cat /proc/meminfo`. If `adb devices` stays `unauthorized`, toggle the Beta Program off and on and replug (a USB-A to USB-C data cable).
3. Join Wi-Fi in Android's own settings, not Frameo's (Frameo can take its Wi-Fi with it when it's disabled). Install the browser that fits the version (above) and open `http://pop-os/clock` as a stand-in.
4. Leave it overnight. Smooth and still up: keep it. If not, return it within 30 days and try a Galaxy Tab A9+ in a stand (Samsung's battery protection caps charging at 85%).

**Power from the Pi?** It can, but shouldn't by default. A second frame lives in another room with its own plug. If one ever sits beside the box, power it from the box's 5 V buck (about 1.6 A spare after the face) rather than the Pi's USB ports, whose 1.6 A is shared with the sound card, Pico and mic. Measure the frame's draw first; a 10" panel is roughly 1 A at 5 V. A USB data cable from the Pi would also give wired ADB.

## Pico 2 W display

The Pico can't run a browser, so chota does the drawing: it renders a PNG at the screen's exact size (the print pipeline already renders pages to PNGs), and the Pico fetches it over Wi-Fi and shows it. All layout stays in TypeScript; the Pico firmware stays dumb, as with the box's controls.

- **Bench test with what we own:** the Pico Display Pack 2.8" (320×240, in the drawer). It proves the fetch-and-show loop on the Pico for no money.
- **The real thing: e-ink.** A colour e-ink panel looks like paper, has no glow, and keeps the picture with the power off, so a Pico can wake every 15–60 minutes, fetch, redraw and sleep on batteries. This is the "Pico satellites elsewhere in the house" idea in [box.md](box.md); the Spectra 6 colour mapping work there carries over. Pimoroni's Inky Frame boards (a Pico W with an e-ink screen and buttons) are the ready-made version; a Waveshare panel plus our Pico is the cheaper one.
- **Poor fit for photos.** E-ink takes seconds to refresh and shows six colours, so photos come out dithered. Use it for the day's information with the odd illustration, and leave photos to the Frameo.

## Chota side

- `/frame` (for the Frameo) and `/api/frame.png?w=…&h=…` (for the Pico): one page, rendered live or to a PNG. Served by the Pi on the home network only, open without login like `/clock`. The frame's browser points at the Pi by a fixed IP (a DHCP reservation in the router): Android often can't resolve `.local` names, and Tailscale names don't reach it.
- **Only chosen photos.** `data/files/` holds everything sent to the bot, private things included, so `/frame` serves only photos picked for it (sent with "frame", or a 👍 from a parent), never the folder.
- **Where photos come from:** the family's WhatsApp sends to the bot, already saved to `data/files/`, are the easy start: send a photo to chota and it joins the frame. Google Photos is no use here: since March 2025 its API only reads photos the app itself uploaded. Immich, self-hosted on the Pi, if we ever want a whole library.
- Screen schedule: off overnight, through the same job system as the box's backlight.

## Open

- Does B0F61WL5GD arrive on Android 6.0.1 (likely) or 8.1/10? That decides the browser and whether the WebView swap is needed.
- ImmichFrame client or a plain full-screen WebView on `/frame`.
- Which e-ink panel for the Pico, and where it hangs.
