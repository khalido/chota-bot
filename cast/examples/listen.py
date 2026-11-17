# Connect to the receiver on a TV, ping it, and print everything it sends back: acks, errors, the pong (with the
# TV's user agent) and remote keys. Launches the receiver if it isn't running. For checking a TV by hand.
# Run: uv run --with pychromecast examples/listen.py "Living Room TV" [seconds] [banner text]
import sys
import threading
import time
import uuid

import pychromecast
from pychromecast.controllers import BaseController

APP_ID = "FCE23D20"
NAMESPACE = "urn:x-cast:dev.khalido.cast"


class Listener(BaseController):
    def __init__(self):
        super().__init__(NAMESPACE, APP_ID)

    def receive_message(self, _message, data):
        print(time.strftime("%H:%M:%S"), data, flush=True)
        return True

    def send(self, type_, data=None):
        msg = {"v": 1, "id": str(uuid.uuid4())[:8], "type": type_, "revision": int(time.time() * 1000)}
        if data is not None:
            msg["data"] = data
        self.send_message(msg)


name = sys.argv[1] if len(sys.argv) > 1 else "Living Room TV"
seconds = float(sys.argv[2]) if len(sys.argv) > 2 else 60
banner = sys.argv[3] if len(sys.argv) > 3 else None

casts, browser = pychromecast.get_listed_chromecasts(friendly_names=[name])
if not casts:
    sys.exit(f"no Cast device called {name!r}")
tv = casts[0]
tv.wait()
listener = Listener()
tv.socket_client.register_handler(listener)
launched, result = threading.Event(), {}
listener.launch(callback_function=lambda ok, _: (result.update(ok=ok), launched.set()))
if not launched.wait(20) or not result.get("ok"):
    sys.exit("the receiver did not launch")

listener.send("ping")
if banner:
    listener.send("banner", {"text": banner, "seconds": seconds})
print(f"listening {seconds:.0f} s; press keys on the remote", flush=True)
time.sleep(seconds)
browser.stop_discovery()
