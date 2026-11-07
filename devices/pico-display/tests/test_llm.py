"""Tests for llm.prompt() — calls the real OpenRouter API."""

import os
import sys
from pathlib import Path
from unittest.mock import MagicMock

# Add src/ to path (at end so CPython's requests is found first)
sys.path.append(str(Path(__file__).parent.parent / "src"))

# Mock the env module before importing llm
env_mock = MagicMock()
env_mock.OPENROUTER_API_KEY = os.environ.get("OPENROUTER_API_KEY", "")
sys.modules["env"] = env_mock

import llm


def test_prompt_basic():
    """Basic prompt returns a non-empty string."""
    reply = llm.prompt("Say hello in 5 words or less")
    assert isinstance(reply, str)
    assert len(reply) > 0
    print(f"Reply: {reply}")


def test_prompt_with_system():
    """Custom system prompt is respected."""
    reply = llm.prompt(
        "What are you?",
        system="You are a pirate. Respond in 10 words or less.",
        max_tokens=100,
    )
    assert isinstance(reply, str)
    assert len(reply) > 0
    print(f"Pirate reply: {reply}")


def test_prompt_fun_fact():
    """Fun fact prompt returns a short fact."""
    reply = llm.prompt(
        "Tell me a fun fact about space",
        system="Share one fun fact in 2 sentences, max 50 words.",
        max_tokens=200,
    )
    assert isinstance(reply, str)
    assert len(reply) > 0
    assert len(reply) <= 400
    print(f"Fact ({len(reply)} chars): {reply}")


def test_prompt_web_search():
    """Web search plugin returns a response with real info."""
    reply = llm.prompt(
        "What happened in science news today?",
        system="Share one interesting fact in 2 sentences, max 50 words.",
        max_tokens=200,
        web_search=True,
    )
    assert isinstance(reply, str)
    assert len(reply) > 0
    print(f"Web search reply ({len(reply)} chars): {reply}")


def test_prompt_max_tokens_respected():
    """Short max_tokens produces short responses."""
    reply = llm.prompt("Tell me everything about the universe", max_tokens=20)
    assert len(reply) < 200
    print(f"Short reply ({len(reply)} chars): {reply}")
