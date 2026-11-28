"""The operator tool end to end: a probe export and a probe import with committed data.

These tests use the production transaction boundaries (``production_client``): data is
committed, the export reads it in its own repeatable-read snapshot, writes a file on disk, and
the import adds it to an empty second Space. Together with the unit tests of the guards they
are the rehearsal Decision 0020 requires before the tool is run anywhere else.
"""

from __future__ import annotations

import json
import os
import sys
from pathlib import Path
from typing import Any
from uuid import UUID
from zipfile import ZipFile

import pytest
from eimir_pro.portability import __main__ as cli
from eimir_pro.portability import export as exporter
from eimir_pro.portability.archive import MIB, BundleLimits
from eimir_pro.portability.common import PortabilityError, TransferScope
from eimir_pro.portability.operations import run_export, run_import
from eimir_pro.portability.schema_guard import TESTED_ALEMBIC_REVISION
from sqlalchemy import func, select, text
from sqlalchemy.engine import Engine

from eimir.appearance.models import AppIconPreference
from eimir.attachments.models import Attachment
from eimir.memories.models import Memory
from eimir.relationship import service as relationship_service
from pro_tests.support.portability import create_memory, upload_image
from tests.conftest import make_account, make_space, requires_database

pytestmark = [pytest.mark.integration, requires_database]

TITLE = "A day at the secret lake"


@pytest.fixture
def stamped(production_client):  # type: ignore[no-untyped-def]
    """The committed test database, stamped like a migrated one; the real state returns afterwards.

    A migrated test database owns a real ``alembic_version`` table that the migration tests of
    the same run rely on. It is set aside by renaming (its primary key goes with it) and put back
    unchanged, never dropped; a database built without migrations ends up without the table, as
    it was.
    """
    _, maker = production_client
    engine: Engine = maker.kw["bind"]
    saved = "alembic_version_saved_by_portability_tests"

    def stamp(revision: str | None) -> None:
        with engine.begin() as connection:
            connection.execute(text("DROP TABLE IF EXISTS alembic_version"))
            if revision is not None:
                connection.execute(text("CREATE TABLE alembic_version (version_num VARCHAR(32))"))
                connection.execute(
                    text("INSERT INTO alembic_version VALUES (:revision)"), {"revision": revision}
                )

    with engine.begin() as connection:
        connection.execute(text(f"DROP TABLE IF EXISTS {saved}"))
        had_real_table = bool(
            connection.execute(text("SELECT to_regclass('alembic_version')")).scalar_one()
        )
        if had_real_table:
            connection.execute(text(f"ALTER TABLE alembic_version RENAME TO {saved}"))
    stamp(TESTED_ALEMBIC_REVISION)
    try:
        yield production_client, engine, stamp
    finally:
        with engine.begin() as connection:
            connection.execute(text("DROP TABLE IF EXISTS alembic_version"))
            if had_real_table:
                connection.execute(text(f"ALTER TABLE {saved} RENAME TO alembic_version"))


def _source(client, maker) -> dict[str, Any]:  # type: ignore[no-untyped-def]
    """Commit a couple with one Memory and one photo through the real request path."""
    with maker.begin() as session:
        anna, ben = make_account(session, "Anna"), make_account(session, "Ben")
        space = make_space(session, anna)
        relationship_service.add_member(session, space.id, ben)
        from tests.conftest import sign_in

        token = sign_in(session, anna)
    with maker.begin() as session:
        photo = upload_image(client, space.id, token, session)
    create_memory(client, space.id, token, TITLE, [photo])
    return {"anna": anna.id, "ben": ben.id, "space": space.id}


def _empty_target(maker, source: dict[str, Any]) -> UUID:  # type: ignore[no-untyped-def]
    """A second, empty Space with the same two members."""
    from eimir.identity.models import Account

    with maker.begin() as session:
        anna, ben = session.get(Account, source["anna"]), session.get(Account, source["ben"])
        target = make_space(session, anna)
        relationship_service.add_member(session, target.id, ben)
        return target.id


def _counts(maker, space_id: UUID) -> tuple[int, int]:  # type: ignore[no-untyped-def]
    with maker.begin() as session:
        memories = session.scalar(
            select(func.count()).select_from(Memory).where(Memory.space_id == space_id)
        )
        attachments = session.scalar(
            select(func.count()).select_from(Attachment).where(Attachment.space_id == space_id)
        )
    return int(memories or 0), int(attachments or 0)


def test_probe_export_then_probe_import_into_an_empty_space(stamped, tmp_path: Path) -> None:  # type: ignore[no-untyped-def]
    (client, maker), engine, _ = stamped
    source = _source(client, maker)
    target = _empty_target(maker, source)
    assert _counts(maker, target) == (0, 0)
    output = tmp_path / "probe.zip"

    result = run_export(
        engine,
        space_id=source["space"],
        account_id=source["anna"],
        scope=TransferScope.SHARED,
        destination=output,
        limits=BundleLimits(),
    )

    assert output.is_file() and result.size == output.stat().st_size
    assert [path.name for path in tmp_path.iterdir()] == ["probe.zip"]  # no partial file left
    assert result.media_count == 1
    source_counts = _counts(maker, source["space"])
    # memories.json holds the Memory rows and their gallery links (one photo here).
    assert result.record_counts["memories"] == source_counts[0] + source_counts[1]
    if os.name == "posix":
        assert output.stat().st_mode & 0o077 == 0, "the plaintext file must be owner-only"

    dry = run_import(
        engine,
        space_id=target,
        account_id=source["anna"],
        source=output,
        dry_run=True,
    )
    assert dry.dry_run and dry.written_objects == 0
    assert dry.summary["newMediaCount"] == 1
    assert _counts(maker, target) == (0, 0), "a dry run writes nothing"

    report = run_import(engine, space_id=target, account_id=source["anna"], source=output)
    assert not report.dry_run and report.written_objects == 2  # the photo and its thumbnail
    assert _counts(maker, target) == source_counts
    with maker.begin() as session:
        titles = {
            memory.payload.title
            for memory in session.scalars(select(Memory).where(Memory.space_id == target))
        }
        assert TITLE in titles

    # Idempotent: the same file again adds nothing.
    again = run_import(engine, space_id=target, account_id=source["anna"], source=output)
    assert again.written_objects == 0
    assert _counts(maker, target) == source_counts


def test_personal_probe_exports_the_owners_design_palette_and_memory_world(  # type: ignore[no-untyped-def]
    stamped, tmp_path: Path
) -> None:
    (_, maker), engine, _ = stamped
    with maker.begin() as session:
        owner = make_account(session, "Anna")
        partner = make_account(session, "Ben")
        space = make_space(session, owner)
        relationship_service.add_member(session, space.id, partner)
        owner_id, space_id = owner.id, space.id
        session.add_all(
            [
                AppIconPreference(
                    account_id=owner_id,
                    space_id=space_id,
                    icon_id="original",
                    wir_design="home_rooms",
                    wir_design_palette="warm",
                    memory_world="crate",
                ),
                AppIconPreference(
                    account_id=partner.id,
                    space_id=space_id,
                    icon_id="original",
                    wir_design_palette="connected",
                    memory_world="stack",
                ),
            ]
        )

    output = tmp_path / "personal.zip"
    run_export(
        engine,
        space_id=space_id,
        account_id=owner_id,
        scope=TransferScope.PERSONAL,
        destination=output,
        limits=BundleLimits(),
    )

    with ZipFile(output) as archive:
        document = json.loads(archive.read("accounts.json"))
    assert document["personalAppearance"] == {
        "appIconId": "original",
        "wirDesign": "home_rooms",
        "designPalette": "warm",
        "memoryWorld": "crate",
    }


def test_the_command_line_runs_both_directions_and_prints_no_content(  # type: ignore[no-untyped-def]
    stamped, tmp_path: Path, monkeypatch, capsys
) -> None:
    (client, maker), engine, _ = stamped
    source = _source(client, maker)
    target = _empty_target(maker, source)
    monkeypatch.setattr(cli, "create_engine", lambda *args, **kwargs: engine)
    output = tmp_path / "cli.zip"

    assert (
        cli.main(
            [
                "export",
                "--space",
                str(source["space"]),
                "--member",
                str(source["anna"]),
                "--scope",
                "shared",
                "--output",
                str(output),
                "--max-bundle-size",
                "1GiB",
            ]
        )
        == 0
    )
    exported = capsys.readouterr()
    source_counts = _counts(maker, source["space"])
    assert "media=1" in exported.out
    assert f"records.memories={source_counts[0] + source_counts[1]}" in exported.out
    assert "plaintext" in exported.out

    assert (
        cli.main(
            [
                "import",
                "--space",
                str(target),
                "--member",
                str(source["anna"]),
                "--input",
                str(output),
                "--map",
                f"{source['anna']}={source['anna']}",
                "--map",
                f"{source['ben']}={source['ben']}",
            ]
        )
        == 0
    )
    imported = capsys.readouterr()
    assert "result=imported" in imported.out
    assert "objectsWritten=2" in imported.out
    # Only names, counts and identifiers are printed, never content.
    assert TITLE not in exported.out + exported.err + imported.out + imported.err
    assert _counts(maker, target) == source_counts


def test_an_unmigrated_or_other_schema_is_refused_before_anything_is_read_or_written(  # type: ignore[no-untyped-def]
    stamped, tmp_path: Path, monkeypatch, capsys
) -> None:
    (client, maker), engine, stamp = stamped
    source = _source(client, maker)
    target = _empty_target(maker, source)
    good = tmp_path / "good.zip"
    run_export(
        engine,
        space_id=source["space"],
        account_id=source["anna"],
        scope=TransferScope.SHARED,
        destination=good,
    )
    monkeypatch.setattr(cli, "create_engine", lambda *args, **kwargs: engine)

    for revision in ("0001", None):
        stamp(revision)
        with pytest.raises(PortabilityError, match="verified against revision"):
            run_export(
                engine,
                space_id=source["space"],
                account_id=source["anna"],
                scope=TransferScope.SHARED,
                destination=tmp_path / "refused.zip",
            )
        assert not (tmp_path / "refused.zip").exists()
        assert not (tmp_path / "refused.zip.part").exists()
        with pytest.raises(PortabilityError, match="target database"):
            run_import(engine, space_id=target, account_id=source["anna"], source=good)
        arguments = ["--space", str(target), "--member", str(source["anna"])]
        assert cli.main(["import", *arguments, "--input", str(good)]) == 2
        assert "Refused" in capsys.readouterr().err
    assert _counts(maker, target) == (0, 0)


def test_export_over_the_budget_names_the_cause_and_leaves_no_file(  # type: ignore[no-untyped-def]
    stamped, tmp_path: Path, monkeypatch, capsys
) -> None:
    (client, maker), engine, _ = stamped
    source = _source(client, maker)
    monkeypatch.setattr(cli, "create_engine", lambda *args, **kwargs: engine)
    output = tmp_path / "toolarge.zip"

    code = cli.main(
        [
            "export",
            "--space",
            str(source["space"]),
            "--member",
            str(source["anna"]),
            "--output",
            str(output),
            "--max-bundle-size",
            "2KiB",
        ]
    )

    assert code == 1
    assert "TRANSFER_TOO_LARGE" in capsys.readouterr().err
    assert list(tmp_path.iterdir()) == [], "neither the file nor a partial file may remain"
    # Control: the same Space exports under the default operator budget.
    assert (
        cli.main(
            [
                "export",
                "--space",
                str(source["space"]),
                "--member",
                str(source["anna"]),
                "--output",
                str(output),
            ]
        )
        == 0
    )
    assert output.stat().st_size > 2 * 1024
    assert output.stat().st_size < MIB


def test_export_never_replaces_a_file_and_never_leaves_a_partial_one(  # type: ignore[no-untyped-def]
    stamped, tmp_path: Path, monkeypatch
) -> None:
    (client, maker), engine, _ = stamped
    source = _source(client, maker)
    arguments: dict[str, Any] = {
        "space_id": source["space"],
        "account_id": source["anna"],
        "scope": TransferScope.SHARED,
    }
    taken = tmp_path / "taken.zip"
    taken.write_bytes(b"precious")
    with pytest.raises(PortabilityError, match="exists already"):
        run_export(engine, destination=taken, **arguments)
    assert taken.read_bytes() == b"precious"

    leftover = tmp_path / "leftover.zip.part"
    leftover.write_bytes(b"old")
    with pytest.raises(PortabilityError, match="partial"):
        run_export(engine, destination=tmp_path / "leftover.zip", **arguments)
    assert leftover.read_bytes() == b"old"
    leftover.unlink()

    def explode(*args: object, **kwargs: object) -> None:
        raise OSError("disk failure")

    monkeypatch.setattr(exporter, "_write_export_archive", explode)
    with pytest.raises(OSError, match="disk failure"):
        run_export(engine, destination=tmp_path / "broken.zip", **arguments)
    assert sorted(path.name for path in tmp_path.iterdir()) == ["taken.zip"]


def test_a_stranger_cannot_be_exported_or_imported_as(stamped, tmp_path: Path) -> None:  # type: ignore[no-untyped-def]
    (client, maker), engine, _ = stamped
    source = _source(client, maker)
    target = _empty_target(maker, source)
    with maker.begin() as session:
        outsider = make_account(session, "Outsider").id
    with pytest.raises(PortabilityError, match="not an active member"):
        run_export(
            engine,
            space_id=source["space"],
            account_id=outsider,
            scope=TransferScope.PERSONAL,
            destination=tmp_path / "x.zip",
        )
    good = tmp_path / "good.zip"
    run_export(
        engine,
        space_id=source["space"],
        account_id=source["anna"],
        scope=TransferScope.SHARED,
        destination=good,
    )
    with pytest.raises(PortabilityError, match="not an active member"):
        run_import(engine, space_id=target, account_id=outsider, source=good)
    assert _counts(maker, target) == (0, 0)


def test_the_import_refuses_an_empty_missing_or_hostile_file(stamped, tmp_path: Path) -> None:  # type: ignore[no-untyped-def]
    from eimir.core.errors import BadRequestError

    (client, maker), engine, _ = stamped
    source = _source(client, maker)
    target = _empty_target(maker, source)
    arguments: dict[str, Any] = {"space_id": target, "account_id": source["anna"]}
    with pytest.raises(PortabilityError, match="cannot be read"):
        run_import(engine, source=tmp_path / "missing.zip", **arguments)
    empty = tmp_path / "empty.zip"
    empty.write_bytes(b"")
    with pytest.raises(PortabilityError, match="empty"):
        run_import(engine, source=empty, **arguments)
    junk = tmp_path / "junk.zip"
    junk.write_bytes(b"not a zip file at all")
    with pytest.raises(BadRequestError):
        run_import(engine, source=junk, **arguments)
    assert _counts(maker, target) == (0, 0)


@pytest.mark.skipif(sys.platform == "win32", reason="file modes are not meaningful on Windows")
def test_the_export_file_is_owner_only_even_under_a_permissive_umask(  # type: ignore[no-untyped-def]
    stamped, tmp_path: Path
) -> None:
    (client, maker), engine, _ = stamped
    source = _source(client, maker)
    previous = os.umask(0)
    try:
        output = tmp_path / "owner.zip"
        run_export(
            engine,
            space_id=source["space"],
            account_id=source["anna"],
            scope=TransferScope.SHARED,
            destination=output,
        )
    finally:
        os.umask(previous)
    assert output.stat().st_mode & 0o777 == 0o600


def test_a_failed_commit_revokes_the_media_the_import_wrote(  # type: ignore[no-untyped-def]
    stamped, tmp_path: Path, monkeypatch
) -> None:
    from sqlalchemy.orm import Session

    from eimir.media import get_media_store

    (client, maker), engine, _ = stamped
    source = _source(client, maker)
    target = _empty_target(maker, source)
    output = tmp_path / "bundle.zip"
    run_export(
        engine,
        space_id=source["space"],
        account_id=source["anna"],
        scope=TransferScope.SHARED,
        destination=output,
    )
    store = get_media_store()
    written: list[str] = []
    original_put = store.put

    def recording_put(key, source_stream, content_type):  # type: ignore[no-untyped-def]
        written.append(key)
        return original_put(key, source_stream, content_type)

    monkeypatch.setattr(store, "put", recording_put)

    def failing_commit(self: Session) -> None:
        raise OSError("fixture commit failure")

    monkeypatch.setattr(Session, "commit", failing_commit)
    with pytest.raises(OSError, match="fixture commit failure"):
        run_import(engine, space_id=target, account_id=source["anna"], source=output)
    monkeypatch.undo()

    assert len(written) == 2
    assert not any(store.exists(key) for key in written), "media of a failed import must be removed"
    assert _counts(maker, target) == (0, 0)
