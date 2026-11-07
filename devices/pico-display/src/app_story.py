import gc
import time

_story = "Press X for a story!"
_loading = False
_x_was_pressed = False

_SYSTEM = (
    "You are a funny storyteller for kids. "
    "Use a real fun fact from the web results to write a tiny funny story in 2-3 sentences, max 35 words. "
    "Make it surprising and silly. "
    "Just the story, no title, no quotes."
)


def _draw(display, colors, WIDTH, HEIGHT):
    # Dark blue background
    display.set_pen(colors["BLUE"])
    display.clear()

    # Title
    display.set_pen(colors["YELLOW"])
    display.text("STORY TIME", 70, 5, WIDTH, 3)

    # Divider line
    display.set_pen(colors["YELLOW"])
    display.rectangle(10, 30, WIDTH - 20, 2)

    # Story text — white on dark blue for readability
    display.set_pen(colors["WHITE"])
    display.text(_story, 10, 40, WIDTH - 20, 2)

    # Button hint
    display.set_pen(colors["CYAN"])
    display.text("X: new story", 10, 222, WIDTH, 2)

    display.update()


def init(display, buttons, led, colors, WIDTH, HEIGHT):
    global _story, _loading, _x_was_pressed
    _story = "Press X for a story!"
    _loading = False
    _x_was_pressed = False
    _draw(display, colors, WIDTH, HEIGHT)


def update(display, buttons, led, colors, WIDTH, HEIGHT):
    global _story, _loading, _x_was_pressed

    x_pressed = buttons["X"].read()
    x_edge = x_pressed and not _x_was_pressed
    _x_was_pressed = x_pressed

    if x_edge and not _loading:
        _loading = True
        _story = "Searching..."
        _draw(display, colors, WIDTH, HEIGHT)
        led.set_rgb(0, 0, 255)

        try:
            import llm
            gc.collect()
            _story = llm.prompt(
                "Tell me something amazing about science, animals, space, or history",
                system=_SYSTEM,
                max_tokens=400,
                web_search=True,
            )
        except Exception as e:
            _story = f"Error: {e}"
            print(f"LLM error: {e}")

        led.set_rgb(0, 0, 0)
        _loading = False
        _draw(display, colors, WIDTH, HEIGHT)
