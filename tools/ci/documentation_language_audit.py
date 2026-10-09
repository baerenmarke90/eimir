#!/usr/bin/env python3
"""Audit active engineering documentation for residual German prose.

This module deliberately complements ``engineering_language_audit.py`` rather
than duplicating its source-code and identifier logic. Active documentation is
scanned with the same engineering-prose detector while frozen review snapshots,
stable repository link targets, and narrowly enumerated product-copy examples
remain outside the migration boundary.
"""

from __future__ import annotations

import re
import sys
from pathlib import Path

from engineering_language_audit import _contains_marker, _format_finding

DOCUMENTATION_ROOTS = (
    Path("docs"),
    Path("specification"),
    Path("design"),
)
DOCUMENTATION_SUFFIXES = {".json", ".md", ".svg"}
EXCLUDED_DOCUMENTATION_PREFIXES = (Path("docs/reviews"),)

# Path-specific values are intentional localized product copy, synthetic domain
# fixtures, or a narrowly identified English false-positive. Keeping these
# exceptions value-based rather than excluding whole files leaves all
# surrounding engineering prose under the audit.
PLAN_COMPLETION_PRODUCT_COPY = (
    "Abschluss für den 11.09.2026 wird gespeichert …",
    "Noch ohne Termin",
    "Wird gespeichert …",
    "Termin ändern",
    "Noch ohne festen Termin",
    "Plan verwalten",
    "Später",
    "Zum Inhalt springen",
    "Zurück zu Planen",
    "Idee von Anna",
    "Dieser Plan ist automatisch für euch beide sichtbar.",
    "Für euch beide sichtbar",
    "Wo steht ihr gerade?",
)

ALLOWED_DOCUMENTATION_TEXTS_BY_PATH = {
    # These three records quote the actual localized UI and the exact Imagegen
    # prompts. Only those literals are exempt; English surrounding prose and
    # every other document remain audited.
    Path(
        "docs/product/design/evidence/508/plan-completion/README.md"
    ): PLAN_COMPLETION_PRODUCT_COPY,
    Path(
        "docs/product/design/references/508/plan-completion-generation.md"
    ): PLAN_COMPLETION_PRODUCT_COPY,
    Path(
        "docs/product/design/references/508/plan-completion-preflight.md"
    ): PLAN_COMPLETION_PRODUCT_COPY,
    Path("design/m2/PLATFORM-HANDOFF.md"): ("Foto hinzufügen",),
    Path("design/m2/SCREEN-FLOWS.md"): (
        "Moment festhalten",
        "Erinnerung",
        "Herzmoment",
        "Meilenstein",
        "Privat",
        "Mit Partner geteilt",
        "Datei wird geprüft …",
        "Foto wird verarbeitet …",
        "Nur für mich",
        "Mit Partner teilen",
        "Kommentar schreiben",
        "Wird gesendet …",
        "Offline · Stand von {Zeit}",
        "Gespeichert",
        "Synchronisiert",
        "Noch nicht gespeichert. Verbinde dich mit dem Internet und versuche es erneut.",
        "Dieser Inhalt wurde inzwischen geändert.",
    ),
    Path("design/m2/SCREEN-STATE-MATRIX.md"): (
        "Eure Story beginnt hier",
        "Erinnerung hinzufügen",
        "Keine passenden gemeinsamen Momente",
        "Filter zurücksetzen",
        "Einige Inhalte konnten nicht geladen werden.",
        "Erneut versuchen",
        "Offline · Stand von {Zeit}",
        "Erneut verbinden",
        "Noch nicht gespeichert.",
        "Fehler korrigieren",
        "Deine Sitzung ist abgelaufen.",
        "Erneut anmelden",
        "Dieser Inhalt ist nicht verfügbar.",
        "Zur Story",
        "Dieser Inhalt wurde inzwischen geändert.",
        "Aktuellen Stand ansehen",
        "Das waren viele Versuche.",
        "Das hat gerade nicht geklappt.",
        "Foto hinzufügen",
        "Noch keine Kommentare",
        "Story wird geladen",
        "Haltet einen gemeinsamen Moment fest, wenn es für euch passt.",
        "3 private Treffer ausgeblendet",
        "Wird gespeichert …",
        "Dieses Dateiformat wird nicht unterstützt.",
        "Diese Datei ist zu groß.",
        "Dieses Bild konnte nicht verarbeitet werden.",
        "Upload unterbrochen.",
        "Upload gerade nicht möglich.",
        "Nur für mich",
        "Mit Partner geteilt",
        "privat",
    ),
    Path("design/m2/m2-screenflow.svg"): (
        "Heute",
        "Planen",
        "Entdecken",
        "Mehr",
        "Moment festhalten",
    ),
    Path("docs/ACCESSIBILITY-QA-MATRIX.md"): ("Noch nicht gespeichert",),
    Path("docs/API-UI-CONTRACTS.md"): (
        "Nur für mich",
        "Für uns beide",
    ),
    Path("docs/COMPONENT-CONTRACTS.md"): (
        "Nur für mich",
        "Für uns beide",
        "Wird gespeichert",
        "Noch nicht gespeichert",
    ),
    Path("docs/CONTENT-PRIVACY-GUIDELINES.md"): (
        "Nur für mich",
        "Für uns beide",
        "Geteilt",
        "Mit Partner teilen",
        "Mit Partner geteilt",
        "Private Inhalte werden nicht für Produkt-Analytics verwendet.",
        "Medien sind nicht öffentlich zugänglich.",
        "eimir. ist privacy-first gestaltet.",
        "Ende-zu-Ende verschlüsselt",
        "Nur ihr könnt das lesen",
        "Vollständig anonym",
        "Offline gespeichert und wird später synchronisiert",
        "Dein Partner sieht diesen Inhalt nicht.",
        "Für euch beide im gemeinsamen Space sichtbar.",
        "Zeitlich geteilt",
        "Erst verwenden, wenn Ablauf und Empfänger fachlich implementiert sind.",
        "Dein Partner sieht diesen Moment nicht.",
        "Der Moment erscheint in eurem gemeinsamen Bereich.",
        "Wird gespeichert …",
        "Foto wird hochgeladen …",
        "Offline · Stand von {Zeit}",
        "Noch nicht gespeichert. Verbinde dich mit dem Internet und versuche es erneut.",
        "Dieser Inhalt wurde inzwischen geändert.",
        "Dieser Inhalt ist nicht verfügbar.",
        "Deine Sitzung ist abgelaufen. Melde dich erneut an.",
        "Das waren viele Versuche. Probiere es in {Dauer} erneut.",
        "Etwas ist schiefgelaufen",
        "Gib der Erinnerung einen kurzen Titel.",
        "Noch nicht gespeichert",
        "Dein Entwurf bleibt hier erhalten. Verbinde dich mit dem Internet und versuche es erneut.",
        "Inzwischen geändert",
        "Dein Partner hat diesen Inhalt bearbeitet. Sieh dir die aktuelle Version an, bevor du erneut speicherst.",
        "Inhalt nicht verfügbar",
        "Er wurde möglicherweise entfernt oder du kannst ihn nicht öffnen.",
        "Eure Story beginnt hier",
        "Haltet einen gemeinsamen Moment fest, wenn es für euch passt.",
        "Wähle ein Foto für diese Erinnerung aus. Ohne Zugriff kannst du die Erinnerung weiterhin ohne Bild speichern.",
        "Gemeinsame Momente nicht verpassen",
        "eimir. kann dich an ausgewählte Termine erinnern. Sensible Inhalte bleiben in der Vorschau standardmäßig verborgen.",
    ),
    Path("docs/DESIGN-PRINCIPLES.md"): (
        "Where am I?",
        "Nur für mich",
        "Mit Partner teilen",
        "Standort aus",
        "Zurück",
        "Verschlüsselt übertragen",
        "Ende-zu-Ende verschlüsselt",
    ),
    Path("docs/INFORMATION-ARCHITECTURE.md"): (
        "Nur für mich",
        "Für mich",
        "Für uns beide",
        "Mit Partner teilen",
        "Geteilt",
    ),
    Path("docs/PARTNER-APP-EXPERIENCE-STANDARD.md"): (
        "Für euch",
        "Ein kleiner Moment für euch",
    ),
    Path("docs/SCREEN-TEMPLATES.md"): ("Noch nicht gespeichert",),
    Path("docs/USER-FLOWS.md"): (
        "Für uns beide",
        "Mit Partner geteilt",
        "Noch nicht gespeichert",
        "Nur für mich",
        "Mit Partner teilen",
        "Als Plan weiterführen",
        "Noch nicht gespeichert. Verbinde dich mit dem Internet und versuche es erneut.",
        "Offline gespeichert",
        "wird später synchronisiert",
        "Dieser Inhalt wurde inzwischen geändert.",
    ),
    Path("docs/UX-PATTERNS.md"): (
        "Für uns beide",
        "Wird gespeichert",
        "Noch nicht gespeichert",
        "Nur für mich",
        "Erinnerung endgültig löschen",
    ),
    Path("docs/decisions/0008-product-ia-harmonization-and-domain-alignment.md"): (
        "Für mich",
    ),
    Path("docs/design/eimir/DESIGN-CHECKPOINT-PHASE-3.md"): (
        "Demnächst",
        "Kürzlich geteilt",
        "Erinnerung des Tages",
        "Vor genau einem Jahr",
        "Mit Lea geteilt",
        "Nur für mich",
    ),
    Path("docs/design/eimir/MOBILE-FIRST-SURFACE-AUDIT.md"): ("Nur für mich",),
    Path("docs/m2/DEMO-SCENARIO.md"): (
        "Sonnenaufgang am See",
        "Unser erster Pastateig",
        "Spaziergang im Sommerregen",
        "Danke, dass du heute einfach zugehört hast.",
        "Unser erster gemeinsamer Garten",
        "Ein Jahr in unserer Wohnung",
        "Den frühen Wecker war es wert.",
        "Nächstes Mal mit heißem Kaffee.",
        "Das bedeutet mir viel.",
        "Erinnerung",
        "Moment festhalten → Erinnerung",
        "Picknick unter den Linden",
        "Nur für mich",
        "Erste gemeinsame Bergtour",
        "Offline · Stand von …",
        "Noch nicht gespeichert",
    ),
    Path("docs/m2/SECURITY-TEST-MATRIX.md"): ("zuletzt geändert",),
    Path("specification/CLEAN-ROOM-MASTER-SPEC.md"): (
        "SideBySide – die Paar-App, die euch gehört.",
        "Eure Erinnerungen sind Ende-zu-Ende verschlüsselt – selbst SideBySide kann sie nicht lesen.",
    ),
    Path("specification/PRODUCT-SPEC.md"): ("Die Paar-App, die euch gehört.",),
}

# A few active documents carry fully localized copy examples on an explicitly
# labelled locale line. Prefix-scoped exceptions are intentionally narrower than
# excluding a file or a section: only the localized payload after this exact
# English engineering label is outside the audit.
ALLOWED_LOCALIZED_LINE_PREFIXES_BY_PATH = {
    Path("docs/USER-FLOWS.md"): ("3. Intentional de-DE message:",),
}

MARKDOWN_LINK_TARGET = re.compile(r"(?<=\]\()[^)]+(?=\))")
REPO_LOCAL_MARKDOWN_TARGET = re.compile(
    r"(?:docs|design|specification)/[A-Za-z0-9_./-]+\.md#[A-Za-z0-9_-]+"
)
# The prose detector contains a lowercase token that overlaps a standard
# dependency-license identifier. Remove that identifier case-sensitively before
# running the case-insensitive prose detector.
STANDARD_LICENSE_TOKEN = re.compile(r"\bMIT(?:-CMU)?\b")


def _repo_relative_path(path: Path, repo_root: Path) -> Path:
    try:
        return path.resolve().relative_to(repo_root.resolve())
    except ValueError:
        return path


def _sanitize_documentation_text(text: str, logical_path: Path) -> str:
    stripped = text.lstrip()
    for prefix in ALLOWED_LOCALIZED_LINE_PREFIXES_BY_PATH.get(logical_path, ()):
        if stripped.startswith(prefix):
            return prefix

    sanitized = text
    for allowed_text in ALLOWED_DOCUMENTATION_TEXTS_BY_PATH.get(logical_path, ()):
        sanitized = sanitized.replace(allowed_text, "")
    sanitized = STANDARD_LICENSE_TOKEN.sub("", sanitized)
    sanitized = MARKDOWN_LINK_TARGET.sub("", sanitized)
    sanitized = REPO_LOCAL_MARKDOWN_TARGET.sub("", sanitized)
    return sanitized


def check_documentation_file(path: Path, repo_root: Path = Path(".")) -> list[str]:
    logical_path = _repo_relative_path(path, repo_root)
    text = path.read_text(encoding="utf-8")
    findings: list[str] = []
    for line_number, line in enumerate(text.splitlines(), start=1):
        sanitized = _sanitize_documentation_text(line, logical_path)
        if _contains_marker(sanitized):
            findings.append(_format_finding(logical_path, line_number, line))
    return findings


def documentation_files(repo_root: Path = Path(".")) -> list[Path]:
    files: list[Path] = []
    for root in DOCUMENTATION_ROOTS:
        scoped_root = repo_root / root
        if not scoped_root.is_dir():
            continue
        for path in scoped_root.rglob("*"):
            logical_path = _repo_relative_path(path, repo_root)
            excluded = any(
                logical_path == prefix or prefix in logical_path.parents
                for prefix in EXCLUDED_DOCUMENTATION_PREFIXES
            )
            if (
                path.is_file()
                and path.suffix in DOCUMENTATION_SUFFIXES
                and not excluded
            ):
                files.append(path)
    return sorted(set(files))


def audit_documentation(repo_root: Path = Path(".")) -> list[str]:
    findings: list[str] = []
    for path in documentation_files(repo_root):
        findings.extend(check_documentation_file(path, repo_root))
    return findings


def main() -> int:
    findings = audit_documentation()
    if findings:
        for finding in findings:
            print(finding, file=sys.stderr)
        print(
            f"Found {len(findings)} likely non-English active-documentation occurrence(s).",
            file=sys.stderr,
        )
        return 1

    print("Active engineering documentation satisfies the English-language audit.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
