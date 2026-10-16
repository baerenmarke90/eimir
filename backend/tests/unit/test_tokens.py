"""Token generation and storage."""

from __future__ import annotations

from eimir.auth.tokens import generate_token, hash_token, tokens_equal


class TestGeneration:
    def test_tokens_are_unique(self) -> None:
        assert len({generate_token() for _ in range(1000)}) == 1000

    def test_token_is_long_enough(self) -> None:
        """Thirty-two random bytes, Base64 encoded, are not guessable."""
        assert len(generate_token()) >= 40

    def test_token_is_url_safe(self) -> None:
        for _ in range(50):
            token = generate_token()
            assert "/" not in token
            assert "+" not in token
            assert "=" not in token


class TestHash:
    def test_is_stable(self) -> None:
        token = generate_token()
        assert hash_token(token) == hash_token(token)

    def test_differs_per_token(self) -> None:
        assert hash_token(generate_token()) != hash_token(generate_token())

    def test_does_not_expose_token(self) -> None:
        token = generate_token()
        assert token not in hash_token(token)

    def test_matches_column_length(self) -> None:
        """The column is String(64); a longer hash would be truncated and create collisions."""
        assert len(hash_token(generate_token())) == 64


class TestComparison:
    def test_detects_equality(self) -> None:
        value = hash_token(generate_token())
        assert tokens_equal(value, value)

    def test_detects_inequality(self) -> None:
        assert not tokens_equal(hash_token(generate_token()), hash_token(generate_token()))
