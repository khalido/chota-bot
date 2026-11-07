"""Tests for our minimal http client vs standard requests library."""

import sys
from pathlib import Path

import requests

# Add src/ to path (at end so CPython's requests is found first)
sys.path.append(str(Path(__file__).parent.parent / "src"))
import phttp


def test_requests_get_quote():
    """Sanity check: standard requests lib works."""
    r = requests.get("https://dummyjson.com/quotes/1")
    assert r.status_code == 200
    data = r.json()
    assert "quote" in data
    assert "author" in data
    print(f"Quote: {data['quote'][:60]}... — {data['author']}")
    r.close()


def test_http_post_json():
    """Our phttp.post_json works against a real API."""
    data = phttp.post_json(
        "https://dummyjson.com/products/add",
        body={"title": "Pico Clock", "price": 42},
    )
    assert "id" in data
    assert data["title"] == "Pico Clock"
    print(f"Created product: {data}")


def test_http_post_json_with_headers():
    """Our phttp.post_json sends custom headers."""
    data = phttp.post_json(
        "https://dummyjson.com/products/add",
        headers={"X-Custom": "test-value"},
        body={"title": "Test"},
    )
    assert "id" in data


def test_http_post_json_https():
    """Verify SSL/TLS works."""
    data = phttp.post_json(
        "https://httpbin.org/post",
        body={"hello": "world"},
    )
    assert data["json"]["hello"] == "world"


def test_http_error_raises():
    """HTTP errors raise OSError."""
    import pytest

    with pytest.raises(OSError, match="HTTP 404"):
        phttp.post_json(
            "https://httpbin.org/status/404",
            body={},
        )
