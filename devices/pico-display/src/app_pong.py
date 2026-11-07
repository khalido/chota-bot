import time

# Ball
_ball_x = 0.0
_ball_y = 0.0
_ball_dx = 0.0
_ball_dy = 0.0
_ball_size = 8

# Paddle
_paddle_x = 0
_paddle_w = 50
_paddle_h = 5
_paddle_dir = 0
_PADDLE_SPEED = 12
_PADDLE_Y_OFFSET = 12

# Game state
_score = 0
_lives = 3
_game_over = False
_game_started = False
_speed = 3.5
_last_tick = 0

# Bricks: list of (x, y, color_name, alive)
_bricks = []
_BRICK_W = 38
_BRICK_H = 10
_BRICK_PAD = 2
_BRICK_TOP = 30
_BRICK_COLS = 8
_BRICK_ROWS = 5
_BRICK_COLORS = ["RED", "MAGENTA", "YELLOW", "GREEN", "CYAN"]


def _make_bricks(WIDTH):
    global _bricks
    _bricks = []
    total_w = _BRICK_COLS * (_BRICK_W + _BRICK_PAD) - _BRICK_PAD
    x_off = (WIDTH - total_w) // 2
    for row in range(_BRICK_ROWS):
        color = _BRICK_COLORS[row % len(_BRICK_COLORS)]
        for col in range(_BRICK_COLS):
            x = x_off + col * (_BRICK_W + _BRICK_PAD)
            y = _BRICK_TOP + row * (_BRICK_H + _BRICK_PAD)
            _bricks.append([x, y, color, True])


def _reset_ball(WIDTH, HEIGHT):
    global _ball_x, _ball_y, _ball_dx, _ball_dy, _speed, _last_tick, _paddle_dir
    _ball_x = float(WIDTH // 2)
    _ball_y = float(HEIGHT // 2 + 30)
    _speed = 3.5
    _ball_dx = _speed * 0.7
    _ball_dy = _speed
    _paddle_dir = 0
    _last_tick = time.ticks_ms()


def init(display, buttons, led, colors, WIDTH, HEIGHT):
    global _game_started, _game_over
    _game_started = False
    _game_over = False
    _reset_ball(WIDTH, HEIGHT)
    _make_bricks(WIDTH)

    global _paddle_x, _score, _lives
    _paddle_x = WIDTH // 2 - _paddle_w // 2
    _score = 0
    _lives = 3

    display.set_pen(colors["BLACK"])
    display.clear()
    display.set_pen(colors["WHITE"])
    display.text("BREAKOUT", 60, 60, WIDTH, 5)
    display.set_pen(colors["GREEN"])
    display.text("Press X to start", 70, 130, WIDTH, 2)
    display.set_pen(colors["WHITE"])
    display.text("B: left  Y: right", 80, 170, WIDTH, 2)
    display.update()


def update(display, buttons, led, colors, WIDTH, HEIGHT):
    global _ball_x, _ball_y, _ball_dx, _ball_dy
    global _paddle_x, _paddle_dir, _score, _lives
    global _game_over, _game_started, _speed, _last_tick

    now = time.ticks_ms()

    if not _game_started or _game_over:
        if buttons["X"].is_pressed:
            _game_started = True
            _game_over = False
            _reset_ball(WIDTH, HEIGHT)
            _make_bricks(WIDTH)
            _paddle_x = WIDTH // 2 - _paddle_w // 2
            _score = 0
            _lives = 3
        else:
            return

    dt = time.ticks_diff(now, _last_tick) / 16.0
    dt = min(dt, 3.0)
    _last_tick = now

    # Paddle: toggle direction on press
    if buttons["B"].read():
        _paddle_dir = 0 if _paddle_dir == -1 else -1
    if buttons["Y"].read():
        _paddle_dir = 0 if _paddle_dir == 1 else 1

    _paddle_x += _paddle_dir * _PADDLE_SPEED
    if _paddle_x <= 0:
        _paddle_x = 0
        _paddle_dir = 0
    elif _paddle_x >= WIDTH - _paddle_w:
        _paddle_x = WIDTH - _paddle_w
        _paddle_dir = 0

    # Ball movement
    _ball_x += _ball_dx * dt
    _ball_y += _ball_dy * dt

    # Wall bounces
    if _ball_x <= 0:
        _ball_x = 0.0
        _ball_dx = abs(_ball_dx)
    elif _ball_x >= WIDTH - _ball_size:
        _ball_x = float(WIDTH - _ball_size)
        _ball_dx = -abs(_ball_dx)
    if _ball_y <= 0:
        _ball_y = 0.0
        _ball_dy = abs(_ball_dy)

    # Paddle collision
    paddle_top = HEIGHT - _PADDLE_Y_OFFSET - _paddle_h
    if (_ball_dy > 0
            and _ball_y + _ball_size >= paddle_top
            and _ball_y + _ball_size <= paddle_top + _paddle_h + 4
            and _ball_x + _ball_size >= _paddle_x
            and _ball_x <= _paddle_x + _paddle_w):
        _ball_dy = -abs(_ball_dy)
        _ball_y = float(paddle_top - _ball_size)
        # Angle based on where ball hits paddle
        hit = (_ball_x + _ball_size / 2 - _paddle_x) / _paddle_w
        _ball_dx = _speed * (hit - 0.5) * 2

    # Brick collisions
    bx = int(_ball_x)
    by = int(_ball_y)
    hit_row = -1
    for i, brick in enumerate(_bricks):
        if not brick[3]:
            continue
        # AABB overlap
        if (bx + _ball_size > brick[0]
                and bx < brick[0] + _BRICK_W
                and by + _ball_size > brick[1]
                and by < brick[1] + _BRICK_H):
            brick[3] = False
            _score += 1
            hit_row = i // _BRICK_COLS
            _ball_dy = -_ball_dy
            _speed += 0.05
            break

    # Row cleared effect
    if hit_row >= 0:
        row_start = hit_row * _BRICK_COLS
        row_clear = True
        for j in range(row_start, row_start + _BRICK_COLS):
            if _bricks[j][3]:
                row_clear = False
                break
        if row_clear:
            # Flash the row white
            ry = _bricks[row_start][1]
            display.set_pen(colors["WHITE"])
            display.rectangle(0, ry, WIDTH, _BRICK_H)
            display.update()
            led.set_rgb(255, 255, 255)
            time.sleep_ms(80)
            led.set_rgb(0, 0, 0)

    # All bricks cleared — win!
    alive = False
    for brick in _bricks:
        if brick[3]:
            alive = True
            break
    if not alive:
        _game_over = True
        display.set_pen(colors["BLACK"])
        display.clear()
        display.set_pen(colors["YELLOW"])
        display.text("YOU WIN!", 60, 80, WIDTH, 5)
        display.set_pen(colors["WHITE"])
        display.text(f"Score: {_score}", 100, 150, WIDTH, 3)
        display.set_pen(colors["GREEN"])
        display.text("Press X to play again", 50, 200, WIDTH, 2)
        display.update()
        return

    # Ball missed paddle — lose a life
    if _ball_y >= HEIGHT:
        _lives -= 1
        if _lives <= 0:
            _game_over = True
            display.set_pen(colors["BLACK"])
            display.clear()
            display.set_pen(colors["RED"])
            display.text("GAME OVER", 50, 80, WIDTH, 5)
            display.set_pen(colors["WHITE"])
            display.text(f"Score: {_score}", 100, 150, WIDTH, 3)
            display.set_pen(colors["GREEN"])
            display.text("Press X to restart", 60, 200, WIDTH, 2)
            display.update()
            return
        else:
            _reset_ball(WIDTH, HEIGHT)
            return

    # Draw
    display.set_pen(colors["BLACK"])
    display.clear()

    # HUD: score + lives
    display.set_pen(colors["WHITE"])
    display.text(str(_score), 5, 2, WIDTH, 2)
    for i in range(_lives):
        display.set_pen(colors["RED"])
        display.circle(WIDTH - 15 - i * 18, 10, 6)

    # Bricks
    for brick in _bricks:
        if brick[3]:
            display.set_pen(colors[brick[2]])
            display.rectangle(brick[0], brick[1], _BRICK_W, _BRICK_H)

    # Ball
    display.set_pen(colors["WHITE"])
    display.rectangle(bx, by, _ball_size, _ball_size)

    # Paddle
    display.set_pen(colors["GREEN"])
    display.rectangle(_paddle_x, paddle_top, _paddle_w, _paddle_h)

    display.update()
