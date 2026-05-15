# py/ — agent instructions

Python sandbox. **Not imported by the SvelteKit app.** Empty by default.

## What you can do here

- **Drop one-off scripts** at `py/<name>.py`. Run with `uv run <name>.py`.
- **`uv add <pypi-pkg>`** to read upstream source when porting an API to TS. Faster than reading docs — source lands at `.venv/lib/python3.14/site-packages/<pkg>/`. Read the actually-used 50-100 LOC, port to TS, optionally `uv remove` later.
- **Build CLI tools** that the kiosk's agent (or another agent) shells out to. Use `typer`. Output JSON or Markdown to stdout. One thing per script.

## Rules

- Python 3.14+. Baseline deps: `httpx`, `typer`, `python-dotenv`. Already installed.
- Add per-script deps with `uv add <pkg>` — don't pre-install heavy stuff.
- **Do not import anything in here from the SvelteKit app.** This folder is a sandbox.
- If a Python module becomes load-bearing for the kiosk, extract it as a sidecar service in a sibling directory (`enphase-svc/` etc.) — see `docs/plan.md` §"Single repo, single language".

## CLI tool conventions

When building a CLI for an agent to call:

- **stdout**: clean JSON or Markdown only. No progress bars, no logs.
- **stderr**: errors, debug info.
- **Exit code**: non-zero on error.
- **One thing per script**: `bus_cli.py next`, not `family_cli.py everything`.
- **Document via `--help`**: typer generates this from docstrings + type hints.
