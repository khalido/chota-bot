import gc

import env
import requests

_ENDPOINT = "https://openrouter.ai/api/v1/chat/completions"
_HEADERS = {
    "Authorization": f"Bearer {env.OPENROUTER_API_KEY}",
    "Content-Type": "application/json",
}

MODEL = "google/gemini-3-flash-preview"

DEFAULT_SYSTEM = (
    "You are a helpful and funny assistant talking to a 10 year old kid. "
    "Keep answers short - max 2 sentences."
)


def _extract_content(raw):
    """Extract content string from API response without full JSON parse."""
    # Check for error first
    err = raw.find('"error"')
    choices = raw.find('"choices"')
    if err != -1 and (choices == -1 or err < choices):
        msg_start = raw.find('"message"', err)
        if msg_start != -1:
            msg_start = raw.find(':"', msg_start) + 2
            msg_end = raw.find('"', msg_start)
            raise OSError(raw[msg_start:msg_end])
        raise OSError("API error")

    # Find "content": "..." in the first choice's message
    # Look for "content" that follows "message"
    msg = raw.find('"message"')
    if msg == -1:
        raise OSError("No message in response")

    ct = raw.find('"content"', msg)
    if ct == -1:
        raise OSError("No content in response")

    # Skip past "content":
    i = raw.find(":", ct + 9) + 1
    # Skip whitespace
    while raw[i] in " \t\n\r":
        i += 1

    if raw[i] == "n":  # null
        raise OSError("Empty response from model")

    if raw[i] != '"':
        raise OSError("Unexpected content format")

    # Extract the JSON string value, handling escapes
    i += 1
    n = len(raw)
    parts = []
    while i < n and raw[i] != '"':
        if raw[i] == "\\":
            i += 1
            if i >= n:
                break
            c = raw[i]
            if c == "n":
                parts.append("\n")
            elif c == "t":
                parts.append("\t")
            elif c == '"':
                parts.append('"')
            elif c == "\\":
                parts.append("\\")
            else:
                parts.append(c)
        else:
            parts.append(raw[i])
        i += 1
    return "".join(parts)


def prompt(user_msg, system=None, model=None, max_tokens=150, web_search=False):
    """Send a prompt via OpenRouter and return the reply text."""
    gc.collect()
    body = {
        "model": model or MODEL,
        "messages": [
            {"role": "system", "content": system or DEFAULT_SYSTEM},
            {"role": "user", "content": user_msg},
        ],
        "max_tokens": max_tokens,
    }

    if web_search:
        body["plugins"] = [
            {
                "id": "web",
                "engine": "exa",
                "max_results": 3,
            }
        ]

    response = requests.post(_ENDPOINT, headers=_HEADERS, json=body)
    raw = response.text
    response.close()
    del response
    gc.collect()

    reply = _extract_content(raw)
    del raw
    gc.collect()
    return reply
