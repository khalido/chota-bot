import gc
import time

_data = None
_last_fetch = 0
_x_was_pressed = False
_FETCH_INTERVAL = 600_000  # 10 minutes

_DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]

_URL = (
    "https://api.open-meteo.com/v1/forecast?"
    "latitude=-33.87&longitude=151.21"
    "&current=temperature_2m,weather_code,relative_humidity_2m,wind_speed_10m"
    "&daily=temperature_2m_max,temperature_2m_min,weather_code,precipitation_probability_max"
    "&timezone=Australia%2FSydney"
    "&forecast_days=3"
)

# WMO weather codes to short descriptions and colors
_WMO = {
    0: ("Clear", "YELLOW"),
    1: ("Clear", "YELLOW"),
    2: ("Cloudy", "WHITE"),
    3: ("Overcast", "WHITE"),
    45: ("Fog", "WHITE"),
    48: ("Icy fog", "CYAN"),
    51: ("Drizzle", "CYAN"),
    53: ("Drizzle", "CYAN"),
    55: ("Drizzle", "CYAN"),
    61: ("Rain", "CYAN"),
    63: ("Rain", "BLUE"),
    65: ("Heavy rain", "BLUE"),
    71: ("Snow", "WHITE"),
    73: ("Snow", "WHITE"),
    75: ("Snow", "WHITE"),
    80: ("Showers", "CYAN"),
    81: ("Showers", "CYAN"),
    82: ("Storms", "BLUE"),
    95: ("Thunder", "MAGENTA"),
    96: ("Hail", "MAGENTA"),
    99: ("Hail", "RED"),
}


def _fetch():
    global _data, _last_fetch
    gc.collect()
    try:
        import requests
        response = requests.get(_URL)
        _data = response.json()
        response.close()
        del response
        gc.collect()
        _last_fetch = time.ticks_ms()
    except Exception as e:
        _data = {"error": str(e)}
        print(f"Weather error: {e}")


def _day_name(date_str):
    """Get short day name from 'YYYY-MM-DD' string."""
    parts = date_str.split("-")
    y, m, d = int(parts[0]), int(parts[1]), int(parts[2])
    t = time.localtime(time.mktime((y, m, d, 0, 0, 0, 0, 0)))
    return _DAYS[t[6]]


def _draw(display, colors, WIDTH, HEIGHT):
    display.set_pen(colors["BLACK"])
    display.clear()

    display.set_pen(colors["CYAN"])
    display.text("SYDNEY", 100, 2, WIDTH, 3)

    if _data is None:
        display.set_pen(colors["WHITE"])
        display.text("Loading...", 80, 100, WIDTH, 3)
        display.update()
        return

    if "error" in _data:
        display.set_pen(colors["RED"])
        display.text(str(_data["error"]), 10, 50, WIDTH - 20, 2)
        display.update()
        return

    cur = _data.get("current", {})
    daily = _data.get("daily", {})

    # Current temp - big
    temp = cur.get("temperature_2m", "?")
    code = cur.get("weather_code", -1)
    desc, desc_color = _WMO.get(code, ("?", "WHITE"))
    display.set_pen(colors["YELLOW"])
    display.text(f"{temp}C", 10, 28, WIDTH, 6)
    display.set_pen(colors[desc_color])
    display.text(desc, 200, 45, WIDTH, 3)

    # Current details
    humidity = cur.get("relative_humidity_2m", "?")
    wind = cur.get("wind_speed_10m", "?")
    display.set_pen(colors["WHITE"])
    display.text(f"{humidity}% humidity  {wind}km/h wind", 10, 85, WIDTH, 2)

    # Divider
    display.set_pen(colors["WHITE"])
    display.rectangle(10, 105, WIDTH - 20, 1)

    # 3-day forecast
    dates = daily.get("time", [])
    hi_list = daily.get("temperature_2m_max", [])
    lo_list = daily.get("temperature_2m_min", [])
    codes = daily.get("weather_code", [])
    rain = daily.get("precipitation_probability_max", [])

    col_w = WIDTH // 3
    for i in range(min(3, len(dates))):
        x = i * col_w + 5

        # Day name
        label = "Today" if i == 0 else _day_name(dates[i])
        display.set_pen(colors["YELLOW"])
        display.text(label, x, 112, col_w, 2)

        # Weather desc
        d, dc = _WMO.get(codes[i] if i < len(codes) else -1, ("?", "WHITE"))
        display.set_pen(colors[dc])
        display.text(d, x, 132, col_w, 2)

        # Hi / Lo
        hi = hi_list[i] if i < len(hi_list) else "?"
        lo = lo_list[i] if i < len(lo_list) else "?"
        display.set_pen(colors["RED"])
        display.text(f"{hi}", x, 155, col_w, 3)
        display.set_pen(colors["CYAN"])
        display.text(f"{lo}", x + 55, 155, col_w, 3)

        # Rain chance
        r = rain[i] if i < len(rain) else 0
        if r and r > 0:
            display.set_pen(colors["BLUE"])
            display.text(f"{r}%rain", x, 185, col_w, 2)

    # Button hint
    display.set_pen(colors["GREEN"])
    display.text("X: refresh", 10, 222, WIDTH, 2)

    display.update()


def init(display, buttons, led, colors, WIDTH, HEIGHT):
    global _data, _last_fetch, _x_was_pressed
    _data = None
    _last_fetch = 0
    _x_was_pressed = False
    _draw(display, colors, WIDTH, HEIGHT)
    _fetch()
    _draw(display, colors, WIDTH, HEIGHT)


def update(display, buttons, led, colors, WIDTH, HEIGHT):
    global _x_was_pressed

    x_pressed = buttons["X"].read()
    x_edge = x_pressed and not _x_was_pressed
    _x_was_pressed = x_pressed

    now = time.ticks_ms()
    auto_refresh = _last_fetch > 0 and time.ticks_diff(now, _last_fetch) > _FETCH_INTERVAL

    if x_edge or auto_refresh:
        _fetch()
        _draw(display, colors, WIDTH, HEIGHT)
