import time

# States: "idle", "waiting", "go", "result", "too_early"
_state = "idle"
_wait_start = 0
_go_time = 0
_delay_ms = 0
_reaction_ms = 0
_best_ms = 0
_round = 0
_x_was_pressed = False

_RATINGS = [
    (150, "LIGHTNING!", "YELLOW"),
    (250, "SUPER FAST!", "GREEN"),
    (350, "NICE!", "CYAN"),
    (500, "NOT BAD!", "WHITE"),
    (9999, "SLEEPY...", "MAGENTA"),
]


def _random_delay():
    """Return a pseudo-random delay between 1500-4000ms."""
    return 1500 + (time.ticks_ms() % 2500)


def init(display, buttons, led, colors, WIDTH, HEIGHT):
    global _state, _best_ms, _round, _x_was_pressed
    _state = "idle"
    _best_ms = 0
    _round = 0
    _x_was_pressed = False

    display.set_pen(colors["BLACK"])
    display.clear()
    display.set_pen(colors["CYAN"])
    display.text("REACTION", 50, 30, WIDTH, 5)
    display.set_pen(colors["WHITE"])
    display.text("TEST", 100, 80, WIDTH, 5)
    display.set_pen(colors["GREEN"])
    display.text("Press X to start", 70, 150, WIDTH, 2)
    display.set_pen(colors["WHITE"])
    display.text("How fast can you react?", 50, 190, WIDTH, 2)
    display.update()


def update(display, buttons, led, colors, WIDTH, HEIGHT):
    global _state, _wait_start, _go_time, _delay_ms
    global _reaction_ms, _best_ms, _round, _x_was_pressed

    x_pressed = buttons["X"].read()
    x_edge = x_pressed and not _x_was_pressed
    _x_was_pressed = x_pressed

    if _state == "idle":
        if x_edge:
            _state = "waiting"
            _delay_ms = _random_delay()
            _wait_start = time.ticks_ms()
            led.set_rgb(255, 0, 0)
            display.set_pen(colors["RED"])
            display.clear()
            display.set_pen(colors["WHITE"])
            display.text("WAIT...", 70, 90, WIDTH, 5)
            display.set_pen(colors["RED"])
            display.text("Don't press yet!", 70, 160, WIDTH, 2)
            display.update()

    elif _state == "waiting":
        if x_edge:
            # Pressed too early!
            _state = "too_early"
            led.set_rgb(255, 0, 255)
            display.set_pen(colors["BLACK"])
            display.clear()
            display.set_pen(colors["MAGENTA"])
            display.text("TOO EARLY!", 30, 60, WIDTH, 5)
            display.set_pen(colors["WHITE"])
            display.text("Wait for green!", 70, 130, WIDTH, 2)
            display.set_pen(colors["GREEN"])
            display.text("X: try again", 90, 200, WIDTH, 2)
            display.update()
            led.set_rgb(0, 0, 0)
            return

        now = time.ticks_ms()
        if time.ticks_diff(now, _wait_start) >= _delay_ms:
            _state = "go"
            _go_time = time.ticks_ms()
            led.set_rgb(0, 255, 0)
            display.set_pen(colors["GREEN"])
            display.clear()
            display.set_pen(colors["BLACK"])
            display.text("GO!", 90, 70, WIDTH, 8)
            display.set_pen(colors["WHITE"])
            display.text("PRESS X NOW!", 60, 170, WIDTH, 3)
            display.update()

    elif _state == "go":
        if x_edge:
            _reaction_ms = time.ticks_diff(time.ticks_ms(), _go_time)
            _round += 1
            if _best_ms == 0 or _reaction_ms < _best_ms:
                _best_ms = _reaction_ms
            _state = "result"
            led.set_rgb(0, 0, 0)

            # Find rating
            rating = "OK"
            rating_color = "WHITE"
            for threshold, label, color in _RATINGS:
                if _reaction_ms < threshold:
                    rating = label
                    rating_color = color
                    break

            display.set_pen(colors["BLACK"])
            display.clear()

            display.set_pen(colors[rating_color])
            display.text(rating, 20, 15, WIDTH, 4)

            display.set_pen(colors["WHITE"])
            display.text(f"{_reaction_ms} ms", 20, 65, WIDTH, 6)

            display.set_pen(colors["CYAN"])
            display.text(f"Best: {_best_ms} ms", 20, 130, WIDTH, 2)
            display.text(f"Round: {_round}", 20, 155, WIDTH, 2)

            display.set_pen(colors["GREEN"])
            display.text("X: go again", 90, 210, WIDTH, 2)
            display.update()

    elif _state == "result" or _state == "too_early":
        if x_edge:
            _state = "waiting"
            _delay_ms = _random_delay()
            _wait_start = time.ticks_ms()
            led.set_rgb(255, 0, 0)
            display.set_pen(colors["RED"])
            display.clear()
            display.set_pen(colors["WHITE"])
            display.text("WAIT...", 70, 90, WIDTH, 5)
            display.set_pen(colors["RED"])
            display.text("Don't press yet!", 70, 160, WIDTH, 2)
            display.update()
