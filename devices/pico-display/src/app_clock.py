import time

_last_min = None
_last_sec = None
_colon_on = True

_DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]
_MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun",
           "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]

# Time-of-day color themes
_TIME_COLORS = [
    (6, "YELLOW"),     # morning
    (12, "WHITE"),     # midday
    (17, "CYAN"),      # afternoon
    (20, "MAGENTA"),   # evening
    (24, "BLUE"),      # night
]


def _first_sunday(year, month):
    """Day of first Sunday in given month."""
    t = time.localtime(time.mktime((year, month, 1, 0, 0, 0, 0, 0)))
    wday = t[6]
    return 1 + (6 - wday) % 7


def _utc_offset():
    """Sydney: UTC+11 (AEDT) Oct first Sun 2am -> Apr first Sun 3am, else UTC+10."""
    utc = time.localtime()
    year, month, day, hour = utc[0], utc[1], utc[2], utc[3]

    if month > 4 and month < 10:
        return 10
    if month == 4:
        boundary = _first_sunday(year, 4)
        if day < boundary or (day == boundary and hour < 16):
            return 11
        return 10
    if month == 10:
        boundary = _first_sunday(year, 10)
        if day > boundary or (day == boundary and hour >= 16):
            return 11
        return 10
    return 11


def _get_local():
    return time.localtime(time.time() + _utc_offset() * 3600)


def _time_color(colors, hour):
    if hour < 6:
        return colors["BLUE"]
    for threshold, color in _TIME_COLORS:
        if hour < threshold:
            return colors[color]
    return colors["BLUE"]


def init(display, buttons, led, colors, WIDTH, HEIGHT):
    global _last_min, _last_sec, _colon_on
    _last_min = None
    _last_sec = None
    _colon_on = True
    _draw(display, colors, WIDTH, HEIGHT)


def _draw(display, colors, WIDTH, HEIGHT):
    t = _get_local()
    hour, minute, sec = t[3], t[4], t[5]
    wday = t[6]
    day, month, year = t[2], t[1], t[0]

    display.set_pen(colors["BLACK"])
    display.clear()

    # Time - large, color based on time of day
    time_color = _time_color(colors, hour)
    display.set_pen(time_color)

    # Draw hours and minutes separately with blinking colon
    h_str = f"{hour:02}"
    m_str = f"{minute:02}"
    display.text(h_str, 30, 55, WIDTH, 8)
    if _colon_on:
        display.text(":", 118, 50, WIDTH, 8)
    display.text(m_str, 148, 55, WIDTH, 8)

    # Seconds - small, top right
    display.set_pen(colors["WHITE"])
    display.text(f":{sec:02}", 268, 70, WIDTH, 3)

    # Date line
    display.set_pen(colors["CYAN"])
    day_name = _DAYS[wday]
    month_name = _MONTHS[month - 1]
    display.text(f"{day_name} {day} {month_name} {year}", 55, 145, WIDTH, 3)

    # Seconds progress bar
    bar_y = 180
    bar_w = 280
    bar_x = (WIDTH - bar_w) // 2
    bar_h = 4
    display.set_pen(colors["WHITE"])
    display.rectangle(bar_x, bar_y, bar_w, bar_h)
    fill_w = int(bar_w * sec / 59) if sec < 60 else bar_w
    display.set_pen(time_color)
    if fill_w > 0:
        display.rectangle(bar_x, bar_y, fill_w, bar_h)

    # Greeting based on time of day
    display.set_pen(colors["GREEN"])
    if hour < 6:
        greeting = "Zzz... go to sleep!"
    elif hour < 12:
        greeting = "Good morning!"
    elif hour < 17:
        greeting = "Good afternoon!"
    elif hour < 20:
        greeting = "Good evening!"
    else:
        greeting = "Almost bedtime!"
    display.text(greeting, 80, 200, WIDTH, 2)

    display.update()


def update(display, buttons, led, colors, WIDTH, HEIGHT):
    global _last_min, _last_sec, _colon_on

    t = _get_local()
    minute, sec = t[4], t[5]

    if sec != _last_sec:
        _colon_on = not _colon_on
        _last_sec = sec
        _draw(display, colors, WIDTH, HEIGHT)
