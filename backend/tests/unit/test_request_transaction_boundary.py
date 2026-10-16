"""Deterministic checks for the FastAPI request transaction lifecycle."""

from __future__ import annotations

from collections.abc import Iterator

from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session
from starlette.types import ASGIApp, Message, Receive, Scope, Send

from eimir.api.deps import DbSession
from eimir.db.session import get_session


class ObserveResponseStart:
    def __init__(self, app: ASGIApp, events: list[str]) -> None:
        self.app = app
        self.events = events

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        async def observed_send(message: Message) -> None:
            if scope["type"] == "http" and message["type"] == "http.response.start":
                self.events.append(f"response_start:{message['status']}")
            await send(message)

        await self.app(scope, receive, observed_send)


def test_db_session_dependency_exits_before_success_response_starts() -> None:
    events: list[str] = []
    app = FastAPI()

    def scoped_session() -> Iterator[Session]:
        session = Session()
        events.append("transaction_enter")
        try:
            yield session
        finally:
            events.append("transaction_exit")
            session.close()

    app.dependency_overrides[get_session] = scoped_session

    @app.post("/probe")
    def probe(_: DbSession) -> dict[str, bool]:
        return {"ok": True}

    with TestClient(ObserveResponseStart(app, events)) as client:
        response = client.post("/probe")

    assert response.status_code == 200
    assert events.index("transaction_exit") < events.index("response_start:200")


def test_dependency_exit_failure_cannot_leave_a_success_response() -> None:
    events: list[str] = []
    app = FastAPI()

    def failing_session() -> Iterator[Session]:
        session = Session()
        events.append("transaction_enter")
        try:
            yield session
            events.append("transaction_exit")
            raise RuntimeError("synthetic transaction commit failure")
        finally:
            session.close()

    app.dependency_overrides[get_session] = failing_session

    @app.post("/probe")
    def probe(_: DbSession) -> dict[str, bool]:
        return {"ok": True}

    instrumented = ObserveResponseStart(app, events)
    with TestClient(instrumented, raise_server_exceptions=False) as client:
        response = client.post("/probe")

    assert response.status_code == 500
    assert "response_start:200" not in events
    assert events.index("transaction_exit") < events.index("response_start:500")
