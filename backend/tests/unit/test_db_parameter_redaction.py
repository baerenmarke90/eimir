"""Bound parameters must not reach the application log.

The application logs unhandled failures with `log.exception`. Without
`hide_parameters`, SQLAlchemy writes bound values into every database error
message and therefore into the log, exactly where content behind the
ProtectedPayload boundary must not appear: titles, text, addresses, and place
coordinates.

M3-D28 explicitly forbids place data in logs. The same rule has applied to the
other protected content since M2, even though it was not documented there.
"""

from __future__ import annotations

from sqlalchemy import Engine

from eimir.db.session import get_engine


def _engine() -> Engine:
    return get_engine()


def test_engine_hides_bound_parameters() -> None:
    assert _engine().hide_parameters is True


def test_database_error_message_does_not_expose_values() -> None:
    """Counter-check using a real SQLAlchemy error message.

    No database access is required: SQLAlchemy decides while constructing the
    error message whether parameters are included.
    """
    from sqlalchemy.exc import StatementError

    error = StatementError(
        "boom",
        "INSERT INTO places (latitude, longitude) VALUES (%(lat)s, %(lon)s)",
        {"lat": "52.520008", "lon": "13.404954"},
        Exception("boom"),
        hide_parameters=_engine().hide_parameters,
    )
    text = str(error)
    assert "52.520008" not in text
    assert "13.404954" not in text
    assert "SQL parameters hidden" in text
