import gc
import os
import sys
import time

import machine
import network
import ntptime
from picographics import DISPLAY_PICO_DISPLAY_2, PicoGraphics
from pimoroni import RGBLED, Button

import env

# Hardware setup
display = PicoGraphics(display=DISPLAY_PICO_DISPLAY_2, rotate=0)
WIDTH, HEIGHT = display.get_bounds()

# Button A (GPIO 12) is the global app-cycle button via IRQ
button_a_pin = machine.Pin(12, machine.Pin.IN, machine.Pin.PULL_UP)
_switch_requested = False
_last_irq_time = 0


def _button_a_handler(pin):
    global _switch_requested, _last_irq_time
    now = time.ticks_ms()
    if time.ticks_diff(now, _last_irq_time) > 300:  # debounce
        _switch_requested = True
        _last_irq_time = now


button_a_pin.irq(trigger=machine.Pin.IRQ_FALLING, handler=_button_a_handler)

# Remaining buttons available to apps
buttons = {
    "B": Button(13),
    "X": Button(14),
    "Y": Button(15),
}

led = RGBLED(6, 7, 8)
pico_led = machine.Pin("LED", machine.Pin.OUT, value=0)

# Colors dict passed to all apps
colors = {
    "RED": display.create_pen(209, 34, 41),
    "ORANGE": display.create_pen(246, 138, 30),
    "WHITE": display.create_pen(255, 255, 255),
    "BLACK": display.create_pen(0, 0, 0),
    "CYAN": display.create_pen(0, 255, 255),
    "MAGENTA": display.create_pen(255, 0, 255),
    "YELLOW": display.create_pen(255, 255, 0),
    "GREEN": display.create_pen(0, 255, 0),
    "BLUE": display.create_pen(50, 50, 255),
}


def clear():
    display.set_pen(colors["BLACK"])
    display.clear()
    display.update()


def blink_led(n=1, rgb=(209, 34, 41), t=0.08):
    for _ in range(n):
        led.set_rgb(*rgb)
        time.sleep(t)
        led.set_rgb(0, 0, 0)
        if n > 1:
            time.sleep(0.05)


def connect_wifi():
    wlan = network.WLAN(network.STA_IF)
    wlan.active(True)
    wlan.connect(env.WIFI_SSID, env.WIFI_PASSWORD)

    max_wait = 25
    while max_wait > 0:
        if wlan.status() < 0 or wlan.status() >= 3:
            break
        max_wait -= 1
        print("waiting for connection...")
        time.sleep(1)

    if wlan.status() != 3:
        raise RuntimeError("network connection failed")

    ip = wlan.ifconfig()[0]
    print(f"connected, ip = {ip}")
    ntptime.settime()
    print(f"Time: {time.localtime()}")
    return ip


# Boot sequence
print(f"booting...\n{os.uname().machine} running {os.uname().version}")
display.set_backlight(0.5)
display.set_font("bitmap8")
clear()

display.set_pen(colors["GREEN"])
display.text("Booting....", 2, 0, scale=3)
display.text(f"Running on {os.uname().machine}", 6, 40, WIDTH, scale=2)
display.update()
blink_led(4)

clear()
ip = connect_wifi()
display.set_pen(colors["GREEN"])
display.text("Connected!", 2, 0, scale=3)
display.text(f"IP: {ip}", 6, 40, WIDTH, scale=2)
display.set_pen(colors["WHITE"])
display.text("Press A to cycle apps", 6, 100, WIDTH, scale=2)
display.update()
time.sleep(2)

# Free boot modules no longer needed
del ip
for mod in ["ntptime", "network", "env"]:
    if mod in sys.modules:
        del sys.modules[mod]
gc.collect()
print(f"Ready to load apps (free: {gc.mem_free()})")

# App switcher — lazy imports to save memory
app_names = ["Clock", "Weather", "Timer", "Breakout", "Reaction", "Story"]
app_modules = ["app_clock", "app_weather", "app_timer", "app_pong", "app_react", "app_story"]
current_app_idx = 0
current_app = None


def switch_app(idx):
    global current_app, current_app_idx, _switch_requested
    # Disable IRQ during switch to prevent re-entry
    button_a_pin.irq(handler=None)
    _switch_requested = False

    # Unload previous app module + its deps to free memory
    if current_app is not None:
        mod_name = app_modules[current_app_idx]
        for m in (mod_name, "llm", "requests"):
            if m in sys.modules:
                del sys.modules[m]
        current_app = None
        gc.collect()

    current_app_idx = idx
    print(f"Switching to {app_names[idx]} (free: {gc.mem_free()})")
    current_app = __import__(app_modules[idx])
    gc.collect()
    current_app.init(display, buttons, led, colors, WIDTH, HEIGHT)
    print(f"Loaded {app_names[idx]} (free: {gc.mem_free()})")

    # Re-enable IRQ
    button_a_pin.irq(trigger=machine.Pin.IRQ_FALLING, handler=_button_a_handler)


switch_app(0)

while True:
    try:
        if _switch_requested:
            _switch_requested = False
            led.set_rgb(0, 0, 0)
            switch_app((current_app_idx + 1) % len(app_names))

        current_app.update(display, buttons, led, colors, WIDTH, HEIGHT)
    except Exception as e:
        print(f"Error in {app_names[current_app_idx]}: {e}")
        display.set_pen(colors["BLACK"])
        display.clear()
        display.set_pen(colors["RED"])
        display.text("ERROR", 10, 10, WIDTH, 4)
        display.set_pen(colors["WHITE"])
        display.text(f"{app_names[current_app_idx]}: {e}", 10, 60, WIDTH, 2)
        display.update()
        time.sleep(3)
        # Try switching to next app
        switch_app((current_app_idx + 1) % len(app_names))
    time.sleep(0.05)
