# py/

Python sandbox alongside the SvelteKit app. **Optional, not part of the running kiosk.** Empty by default.

## What's in here

- **`pyproject.toml`** — minimal `uv` project. Baseline deps: `httpx`, `typer`, `python-dotenv`. Add per-script deps with `uv add <pkg>` only when needed.
- Drop ad-hoc scripts at `py/<name>.py`, or focused CLI tools the agent shells out to.

## Setup

```bash
cd py
uv sync             # creates .venv, installs deps
ln -s ../.env .env  # share env vars with the SvelteKit app
```

Python 3.14+ required.

## Quick example — a typer CLI an agent can shell out to

```python
# py/bus_cli.py
import typer, httpx, json

app = typer.Typer()

@app.command()
def next(format: str = "json"):
    """Next bus from the family stop."""
    data = httpx.get("...").json()
    typer.echo(json.dumps(data) if format == "json" else f"{data['route']} in {data['minutes']} min")

if __name__ == "__main__":
    app()
```

```bash
uv run bus_cli.py next --format json
```

## When to use this folder

- **Reading upstream source while porting an API to TS** — `uv add <pkg>`, then read `.venv/lib/.../site-packages/<pkg>/` (faster than docs)
- **Debugging by comparison** — quick Python version of a TS tool to A/B inputs
- **Earning a sidecar** — if a Python module becomes load-bearing, extract it as a sibling service (`enphase-svc/` etc.) per `docs/plan.md` §"Single repo, single language"
- **Building agent CLIs** — typer-based scripts the agent shells out to

## Don't import this from the SvelteKit app

Sandbox. The kiosk uses TS exclusively. Anything load-bearing should be ported or extracted, not run ad-hoc from here.
