import math
import time

_duration_options = [1, 2, 3, 5, 10, 15, 20, 25, 30, 45, 60]
_duration_idx = 3  # default 5 min
_duration_secs = 0
_remaining = 0
_running = False
_start_ticks = 0
_elapsed_at_pause = 0
_finished = False
_flash_state = False
_last_flash = 0
_b_was_pressed = False
_x_was_pressed = False
_y_was_pressed = False

_DONE_MSGS = [
    "DONE! GO GO GO!",
    "TIMES UP!!!",
    "DING DING DING!",
    "FINISHED! WOO!",
    "BOOM! DONE!",
    "STOP! PENCILS DOWN!",
]
_done_msg_idx = 0


def _pie_color(colors, fraction):
    if fraction > 0.5:
        return colors["GREEN"]
    if fraction > 0.2:
        return colors["YELLOW"]
    return colors["RED"]


def _draw_pie(display, colors, cx, cy, radius, fraction_remaining):
    """Draw a countdown pie with color based on time left."""
    display.set_pen(_pie_color(colors, fraction_remaining))
    display.circle(cx, cy, radius)

    if fraction_remaining >= 1.0:
        return

    fraction_consumed = 1.0 - fraction_remaining
    if fraction_consumed <= 0:
        return

    display.set_pen(colors["BLACK"])

    if fraction_consumed >= 1.0:
        display.circle(cx, cy, radius)
        return

    start_angle = -math.pi / 2
    end_angle = start_angle + fraction_consumed * 2 * math.pi
    steps = max(4, int(fraction_consumed * 60))

    for i in range(steps):
        a1 = start_angle + (end_angle - start_angle) * i / steps
        a2 = start_angle + (end_angle - start_angle) * (i + 1) / steps
        r = radius * 1.5
        x1 = int(cx + r * math.cos(a1))
        y1 = int(cy + r * math.sin(a1))
        x2 = int(cx + r * math.cos(a2))
        y2 = int(cy + r * math.sin(a2))
        display.triangle(cx, cy, x1, y1, x2, y2)


def init(display, buttons, led, colors, WIDTH, HEIGHT):
    global _duration_idx, _duration_secs, _remaining, _running
    global _start_ticks, _elapsed_at_pause, _finished
    global _flash_state, _last_flash
    global _b_was_pressed, _x_was_pressed, _y_was_pressed

    _duration_idx = 3
    _duration_secs = _duration_options[_duration_idx] * 60
    _remaining = _duration_secs
    _running = False
    _start_ticks = 0
    _elapsed_at_pause = 0
    _finished = False
    _flash_state = False
    _last_flash = 0
    _b_was_pressed = False
    _x_was_pressed = False
    _y_was_pressed = False

    _draw_screen(display, colors, WIDTH, HEIGHT)


def _draw_screen(display, colors, WIDTH, HEIGHT):
    display.set_pen(colors["BLACK"])
    display.clear()

    if _finished:
        # Fun flashing finish screen
        if _flash_state:
            display.set_pen(colors["RED"])
            led_r, led_g, led_b = 255, 0, 0
        else:
            display.set_pen(colors["YELLOW"])
            led_r, led_g, led_b = 255, 255, 0

        msg = _DONE_MSGS[_done_msg_idx]
        display.text(msg, 20, 50, WIDTH, 4)

        display.set_pen(colors["WHITE"])
        display.text("Great job!", 100, 120, WIDTH, 3)

        display.set_pen(colors["GREEN"])
        display.text("Press any button to reset", 20, 200, WIDTH, 2)
        display.update()
        return

    mins = _remaining // 60
    secs = _remaining % 60

    # Pie chart on the left
    cx, cy, radius = 90, 120, 80
    fraction = _remaining / _duration_secs if _duration_secs > 0 else 0
    _draw_pie(display, colors, cx, cy, radius, fraction)

    # Time remaining inside pie
    display.set_pen(colors["WHITE"])
    if mins > 0:
        display.text(f"{mins}:{secs:02}", cx - 35, cy - 10, WIDTH, 4)
    else:
        display.text(f"{secs}", cx - 18, cy - 10, WIDTH, 4)

    # Duration label on the right
    display.set_pen(colors["CYAN"])
    dur = _duration_options[_duration_idx]
    display.text(f"{dur} min", 200, 50, WIDTH, 3)

    # Status
    if _running:
        display.set_pen(colors["GREEN"])
        display.text("RUNNING", 200, 100, WIDTH, 2)
    else:
        display.set_pen(colors["YELLOW"])
        display.text("READY", 210, 100, WIDTH, 2)

    # Progress bar under the right side
    bar_x, bar_y, bar_w, bar_h = 195, 135, 115, 12
    display.set_pen(colors["WHITE"])
    display.rectangle(bar_x, bar_y, bar_w, bar_h)
    display.set_pen(_pie_color(colors, fraction))
    fill_w = max(0, int(bar_w * fraction))
    if fill_w > 0:
        display.rectangle(bar_x, bar_y, fill_w, bar_h)

    # Controls
    display.set_pen(colors["WHITE"])
    display.text("X:start  B/Y:time", 20, 220, WIDTH, 2)

    display.update()


def update(display, buttons, led, colors, WIDTH, HEIGHT):
    global _duration_idx, _duration_secs, _remaining, _running
    global _start_ticks, _elapsed_at_pause, _finished
    global _flash_state, _last_flash, _done_msg_idx
    global _b_was_pressed, _x_was_pressed, _y_was_pressed

    b_pressed = buttons["B"].read()
    x_pressed = buttons["X"].read()
    y_pressed = buttons["Y"].read()

    b_edge = b_pressed and not _b_was_pressed
    x_edge = x_pressed and not _x_was_pressed
    y_edge = y_pressed and not _y_was_pressed
    _b_was_pressed = b_pressed
    _x_was_pressed = x_pressed
    _y_was_pressed = y_pressed

    needs_redraw = False

    if _finished:
        now = time.ticks_ms()
        if time.ticks_diff(now, _last_flash) > 300:
            _flash_state = not _flash_state
            _last_flash = now
            needs_redraw = True
            if _flash_state:
                led.set_rgb(255, 0, 0)
            else:
                led.set_rgb(255, 255, 0)

        if x_edge or b_edge or y_edge:
            _finished = False
            _running = False
            _elapsed_at_pause = 0
            _remaining = _duration_secs
            led.set_rgb(0, 0, 0)
            needs_redraw = True

        if needs_redraw:
            _draw_screen(display, colors, WIDTH, HEIGHT)
        return

    # X: start/pause
    if x_edge:
        if _running:
            _elapsed_at_pause += time.ticks_diff(time.ticks_ms(), _start_ticks)
            _running = False
        else:
            _start_ticks = time.ticks_ms()
            _running = True
        needs_redraw = True

    # B: time down (only when not running)
    if b_edge and not _running:
        _duration_idx = (_duration_idx - 1) % len(_duration_options)
        _duration_secs = _duration_options[_duration_idx] * 60
        _remaining = _duration_secs
        _elapsed_at_pause = 0
        needs_redraw = True

    # Y: time up (only when not running)
    if y_edge and not _running:
        _duration_idx = (_duration_idx + 1) % len(_duration_options)
        _duration_secs = _duration_options[_duration_idx] * 60
        _remaining = _duration_secs
        _elapsed_at_pause = 0
        needs_redraw = True

    # Update remaining time
    if _running:
        elapsed_ms = _elapsed_at_pause + time.ticks_diff(time.ticks_ms(), _start_ticks)
        new_remaining = max(0, _duration_secs - elapsed_ms // 1000)
        if new_remaining != _remaining:
            _remaining = new_remaining
            needs_redraw = True
        if _remaining <= 0:
            _finished = True
            _running = False
            _elapsed_at_pause = 0
            _last_flash = time.ticks_ms()
            # Pick a random-ish done message
            _done_msg_idx = (time.ticks_ms() // 100) % len(_DONE_MSGS)
            needs_redraw = True

    if needs_redraw:
        _draw_screen(display, colors, WIDTH, HEIGHT)
