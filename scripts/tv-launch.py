# /// script
# requires-python = ">=3.12"
# dependencies = ["pychromecast>=14"]
# ///
"""Launch (or stop) chota's Cast app on a TV, for the first test before
@khalido/home's `launch` is released. Run from a machine on the home network:

    uv run scripts/tv-launch.py "Living Room TV" FCE23D20        # launch
    uv run scripts/tv-launch.py "Living Room TV" FCE23D20 stop   # back to ambient

The app ID is the unpublished Custom Receiver registered for chota; the TV must
be registered as a test device for it. Turns nothing off: Cast can't.
"""

import sys

import pychromecast

name, app_id = sys.argv[1], sys.argv[2]
stop = len(sys.argv) > 3 and sys.argv[3] == "stop"

casts, browser = pychromecast.get_listed_chromecasts(friendly_names=[name], timeout=10)
try:
    if not casts:
        sys.exit(f"no Cast device called {name!r} found on this network")
    cc = casts[0]
    cc.wait(timeout=10)
    print(f"{name}: running {cc.status.display_name!r} (app {cc.status.app_id})")
    if stop:
        cc.quit_app()
        print("stopped")
    else:
        cc.start_app(app_id, timeout=20)
        print(f"launched {app_id}")
finally:
    pychromecast.discovery.stop_discovery(browser)
