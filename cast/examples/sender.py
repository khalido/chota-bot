# A sender in Python with pychromecast (14.x): launch the receiver on a TV and push one screen.
# Run: uv run --with pychromecast examples/sender.py "Living Room TV"
import json
import sys
import threading
import time
import uuid

import pychromecast
from pychromecast.controllers import BaseController

APP_ID = "FCE23D20"  # the published receiver's app id
NAMESPACE = "urn:x-cast:dev.khalido.cast"
CHUNK_CHARS = 20_000  # of ASCII JSON; escaped at most 2x, so each message stays under 60 KB


class Dashboard(BaseController):
    def __init__(self):
        super().__init__(NAMESPACE, APP_ID)

    def receive_message(self, _message, data):
        print("receiver:", data)  # {"v": 1, "type": "ack" | "error", ...}
        return True

    def push(self, type_, data, revision=None):
        """Send one payload, split into parts when it is too big for one message."""
        head = {"v": 1, "id": str(uuid.uuid4()), "type": type_, "revision": int(time.time() * 1000) if revision is None else revision}
        body = json.dumps(data)  # ensure_ascii: one byte per character
        if len(body) <= CHUNK_CHARS:
            return self.send_message({**head, "seq": 0, "total": 1, "data": data})
        parts = [body[i : i + CHUNK_CHARS] for i in range(0, len(body), CHUNK_CHARS)]
        for seq, chunk in enumerate(parts):
            self.send_message({**head, "seq": seq, "total": len(parts), "chunk": chunk})


name = sys.argv[1] if len(sys.argv) > 1 else "Living Room TV"
casts, browser = pychromecast.get_listed_chromecasts(friendly_names=[name])
if not casts:
    sys.exit(f"no Cast device called {name!r}")
tv = casts[0]
tv.wait()

dashboard = Dashboard()
tv.socket_client.register_handler(dashboard)
launched, result = threading.Event(), {}
dashboard.launch(callback_function=lambda ok, _: (result.update(ok=ok), launched.set()))
if not launched.wait(20) or not result.get("ok"):
    sys.exit("the receiver did not launch")

dashboard.push("screens", {
    "screens": [{
        "id": "home",
        "title": "Home",
        "blocks": [
            {"type": "clock"},
            {"type": "stat", "label": "Inside", "value": 21.5, "unit": "°C", "delta": "+1° since 7 am"},
        ],
    }]
})
time.sleep(2)  # let the ack arrive
browser.stop_discovery()
