"""Authorization foundations without a database.

These tests verify the shape: which classes exist, which ones the server can
enforce, what conditions it builds from them, and whether the mixin can be
used by multiple domains. Integration tests verify that those conditions have
the intended effect in real PostgreSQL.
"""

from __future__ import annotations

import re
from typing import ClassVar
from uuid import UUID

import pytest
from sqlalchemy import MetaData, String, select
from sqlalchemy.dialects import postgresql
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column

from eimir.authorization import (
    ENFORCEABLE_PRIVACY_CLASSES,
    Access,
    AuthorizationContext,
    PrivacyClass,
    PrivateResourceMixin,
    ResourceAbsence,
    SharedWrite,
    access_clause,
    privacy_clause,
    readable,
    writable,
)
from eimir.authorization.rules import rules_for
from eimir.core.ids import new_id
from eimir.db.base import NAMING_CONVENTION


class ProbeBase(DeclarativeBase):
    """Use separate metadata so these test models register nothing globally.

    They are compiled only, never created. This file verifies that two
    different domains can use the same mixin; that needs two models, not
    tables.
    """

    metadata = MetaData(naming_convention=NAMING_CONVENTION)


class Probe(PrivateResourceMixin, ProbeBase):
    __tablename__ = "probes"

    id: Mapped[UUID] = mapped_column(postgresql.UUID(as_uuid=True), primary_key=True)
    label: Mapped[str] = mapped_column(String(32))


class SecondProbe(PrivateResourceMixin, ProbeBase):
    __tablename__ = "second_probes"

    id: Mapped[UUID] = mapped_column(postgresql.UUID(as_uuid=True), primary_key=True)
    note: Mapped[str] = mapped_column(String(32))


class SharedProbe(PrivateResourceMixin, ProbeBase):
    """A domain written collaboratively according to M3-D01."""

    __tablename__ = "shared_probes"

    shared_write: ClassVar[SharedWrite] = SharedWrite.COLLABORATIVE

    id: Mapped[UUID] = mapped_column(postgresql.UUID(as_uuid=True), primary_key=True)
    label: Mapped[str] = mapped_column(String(32))


CONTEXT = AuthorizationContext(account_id=new_id(), space_id=new_id())


class TestPrivacyClasses:
    def test_specification_is_fully_represented(self) -> None:
        """Section 7 of the master specification, verbatim values."""
        assert {privacy_class.value for privacy_class in PrivacyClass} == {
            "SPACE_SHARED",
            "OWNER_ONLY",
            "TEMPORARY_SHARED",
            "EPHEMERAL_CONTEXT",
            "SYSTEM_METADATA",
        }

    def test_there_is_no_public_class(self) -> None:
        assert not any("PUBLIC" in privacy_class.value for privacy_class in PrivacyClass)

    def test_only_classes_with_rules_are_currently_enforceable(self) -> None:
        assert set(ENFORCEABLE_PRIVACY_CLASSES) == {
            PrivacyClass.SPACE_SHARED,
            PrivacyClass.OWNER_ONLY,
        }

    @pytest.mark.parametrize("access", list(Access))
    def test_storable_and_rule_backed_classes_match(self, access: Access) -> None:
        """Otherwise rows could have no protection, or a rule could match nothing."""
        assert set(rules_for(access)) == set(ENFORCEABLE_PRIVACY_CLASSES)

    def test_column_allows_only_enforceable_classes(self) -> None:
        allowed = set(Probe.__table__.c.privacy_class.type.enums)
        assert allowed == {privacy_class.value for privacy_class in ENFORCEABLE_PRIVACY_CLASSES}
        assert "TEMPORARY_SHARED" not in allowed


class TestCondition:
    def _sql(self, access: Access) -> str:
        return str(
            access_clause(Probe, CONTEXT, access).compile(
                dialect=postgresql.dialect(), compile_kwargs={"literal_binds": True}
            )
        )

    def test_space_condition_always_comes_first(self) -> None:
        """Without tenant isolation, an owner could see a row in a former Space."""
        for access in Access:
            assert f"probes.space_id = '{CONTEXT.space_id}'" in self._sql(access)

    def test_owner_only_is_bound_to_owner(self) -> None:
        sql = self._sql(Access.READ)
        assert "OWNER_ONLY" in sql
        assert f"probes.owner_id = '{CONTEXT.account_id}'" in sql

    def test_space_shared_read_is_not_bound_to_owner(self) -> None:
        sql = self._sql(Access.READ)
        shared = sql.split("SPACE_SHARED")[1].split("OR")[0]
        assert "owner_id" not in shared

    def test_default_write_is_owner_only(self) -> None:
        """Even shared rows are edited by their author while the partner reads."""
        sql = self._sql(Access.WRITE)
        assert sql.count("owner_id") == 2

    def test_class_without_rule_is_absent_from_condition(self) -> None:
        sql = self._sql(Access.READ)
        for privacy_class in set(PrivacyClass) - set(ENFORCEABLE_PRIVACY_CLASSES):
            assert privacy_class.value not in sql

    def test_no_rules_fails_closed(self, monkeypatch) -> None:  # type: ignore[no-untyped-def]
        """Fail closed: forgetting a rule hides rows rather than exposing them.

        If an empty condition were true instead of false, omitting a rule
        could expose the complete data set.
        """
        from eimir.authorization import rules

        monkeypatch.setattr(rules, "_RULES", {Access.READ: {}})
        sql = str(privacy_clause(Probe, CONTEXT, Access.READ).compile(dialect=postgresql.dialect()))
        assert sql.strip().lower() == "false"


class TestWriteMode:
    """`SPACE_SHARED` answers the read question, not the write question.

    Both write modes use the same privacy class: Memory and Milestone remain
    author-only (specification section 14), while Wish, Plan, Place, Chapter,
    and Collection are collaborative write (M3-D01). The model, not the
    endpoint, declares which applies.
    """

    def _sql(self, model: type, access: Access) -> str:
        return str(
            access_clause(model, CONTEXT, access).compile(
                dialect=postgresql.dialect(), compile_kwargs={"literal_binds": True}
            )
        )

    def test_default_is_narrower_mode(self) -> None:
        """A missing declaration must not accidentally make anything writable."""
        assert PrivateResourceMixin.shared_write is SharedWrite.AUTHOR_ONLY

    def test_collaborative_write_is_not_bound_to_creator(self) -> None:
        sql = self._sql(SharedProbe, Access.WRITE)
        shared = sql.split("SPACE_SHARED")[1].split("OR")[0]
        assert "owner_id" not in shared

    def test_space_condition_still_comes_first(self) -> None:
        """Otherwise a former partner could keep writing."""
        sql = self._sql(SharedProbe, Access.WRITE)
        assert f"shared_probes.space_id = '{CONTEXT.space_id}'" in sql

    def test_owner_only_remains_bound_to_owner_under_collaborative_write(self) -> None:
        """Collaborative write applies only to shared rows.

        If the same domain later also carries `OWNER_ONLY` rows, this setting
        must not make the partner a co-author of those rows.
        """
        sql = self._sql(SharedProbe, Access.WRITE)
        private = sql.split("OWNER_ONLY")[1]
        assert f"shared_probes.owner_id = '{CONTEXT.account_id}'" in private

    def test_setting_applies_only_to_its_domain(self) -> None:
        assert Probe.shared_write is SharedWrite.AUTHOR_ONLY
        assert "owner_id" in self._sql(Probe, Access.WRITE).split("SPACE_SHARED")[1].split("OR")[0]

    def test_reading_is_unaffected_by_write_mode(self) -> None:
        """The setting affects writes; shared rows were already shared for reads."""
        shared = self._sql(SharedProbe, Access.READ)
        author_only = self._sql(Probe, Access.READ)
        assert shared.replace("shared_probes", "probes") == author_only


class TestAbsence:
    def test_domain_always_responds_consistently(self) -> None:
        absence = ResourceAbsence("Probe not found.", "PROBE_NOT_FOUND")
        error = absence.error()
        assert error.status == 404
        assert error.code == "PROBE_NOT_FOUND"
        assert error.detail == "Probe not found."

    def test_default_remains_neutral(self) -> None:
        assert PrivateResourceMixin.privacy_absence.code == "RESOURCE_NOT_FOUND"


class TestReusability:
    """Two domains, one mixin, with no copied guard per table."""

    @pytest.mark.parametrize("model", [Probe, SecondProbe])
    def test_both_get_the_same_columns(self, model: type) -> None:
        assert {"space_id", "owner_id", "privacy_class"} <= set(model.__table__.c.keys())

    @pytest.mark.parametrize("model", [Probe, SecondProbe])
    def test_both_get_their_own_check_constraint(self, model: type) -> None:
        names = {
            constraint.name
            for constraint in model.__table__.constraints
            if constraint.name is not None
        }
        assert f"ck_{model.__tablename__}_privacy_class" in names

    def test_condition_names_correct_table(self) -> None:
        sql = str(access_clause(SecondProbe, CONTEXT, Access.READ))
        assert "second_probes.space_id" in sql
        assert re.search(r"(?<![_a-z])probes\.", sql) is None

    def test_each_domain_keeps_its_own_table(self) -> None:
        """There is no shared universal-content table."""
        assert Probe.__table__ is not SecondProbe.__table__


class TestReadyStatements:
    """`readable` and `writable` are the entry points domains use.

    They carry the authorization condition before a domain adds filters,
    ordering, or limits, so the condition belongs here rather than at each
    caller.
    """

    def test_readable_carries_read_condition(self) -> None:
        assert str(readable(Probe, CONTEXT)) == str(
            select(Probe).where(access_clause(Probe, CONTEXT, Access.READ))
        )

    def test_writable_carries_write_condition(self) -> None:
        assert str(writable(Probe, CONTEXT)) == str(
            select(Probe).where(access_clause(Probe, CONTEXT, Access.WRITE))
        )

    def test_read_and_write_conditions_differ(self) -> None:
        assert str(readable(Probe, CONTEXT)) != str(writable(Probe, CONTEXT))
