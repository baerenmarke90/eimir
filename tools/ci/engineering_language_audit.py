#!/usr/bin/env python3
"""Guard the staged English engineering-language migration boundary.

This is deliberately not a generic language detector. For Python in the #214
backend scope it checks engineering surfaces only: identifiers, comments,
docstrings, assertions, and developer/runtime diagnostics. For the migrated
#215 Web, Android, CI, deployment, and developer-tooling scope it checks the
complete handwritten text while removing narrow, explicit localized-product
fixtures. Generated, vendored, and localization-owned paths remain excluded.
"""

from __future__ import annotations

import ast
import io
import re
import sys
import tokenize
from pathlib import Path

SCOPED_FILES = (
    Path("AGENTS.md"),
    Path("CONTRIBUTING.md"),
    Path("docs/ENGINEERING-LANGUAGE.md"),
    Path("docs/ENGINEERING-LANGUAGE-MIGRATION.md"),
    Path("docs/ENGINEERING-LANGUAGE-FOLLOWUPS.md"),
    Path("docs/REUSE-BEFORE-BUILD.md"),
    Path(".github/pull_request_template.md"),
    Path(".github/workflows/reuse-review.yml"),
    Path("tools/openapi/generate.sh"),
    Path("tools/ci/status_drift.py"),
    Path("tools/ci/test_status_drift.py"),
    Path("compose.yaml"),
)

BACKEND_ROOTS = (
    Path("backend/src/eimir"),
    Path("backend/scripts"),
    Path("backend/alembic"),
    Path("backend/tests"),
)

BACKEND_SUFFIXES = {".py", ".md", ".ini", ".toml", ".txt", ".sh"}
BACKEND_FILENAMES = {"Dockerfile"}

PLATFORM_ROOTS = (
    Path(".github"),
    Path("web"),
    Path("android"),
    Path("deploy"),
    Path("tools"),
)

PLATFORM_SUFFIXES = {
    ".conf",
    ".css",
    ".env",
    ".envsh",
    ".html",
    ".js",
    ".json",
    ".kt",
    ".kts",
    ".md",
    ".pro",
    ".properties",
    ".py",
    ".sh",
    ".sql",
    ".ts",
    ".tsx",
    ".txt",
    ".xml",
    ".yaml",
    ".yml",
}
PLATFORM_FILENAMES = {"Dockerfile"}
EXCLUDED_PLATFORM_PATHS = {
    Path("android/gradlew"),
    Path("android/gradlew.bat"),
    Path("android/gradle/verification-metadata.xml"),
    Path("android/app/src/main/res/values/strings.xml"),
    # F1 internal proof copy is localization-owned, like production resources.
    # Its Kotlin/TSX implementation and tests remain inside the audit boundary.
    Path("android/app/src/debug/res/values/strings_visual_proof.xml"),
    Path("web/e2e/fixtures/locales/de.ts"),
    Path("web/package-lock.json"),
    Path("tools/ci/engineering_language_audit.py"),
    Path("tools/ci/test_engineering_language_audit.py"),
}
EXCLUDED_PLATFORM_PREFIXES = (
    Path("android/.gradle"),
    Path("android/api/generated"),
    Path("android/app/build"),
    Path("android/build"),
    Path("android/gradle/wrapper"),
    Path("web/dist"),
    Path("web/node_modules"),
    Path("web/e2e/node_modules"),
    Path("web/e2e/test-results"),
    Path("web/src/api/generated"),
    Path("web/src/i18n/locales"),
)

# Common German grammar is safe to use for comments/docstrings because those
# are engineering prose. The additional stems catch transliterated legacy
# identifiers that contain compounds rather than standalone words. Avoid
# ambiguous tokens that are also ordinary English engineering prose (for
# example the article "an").
ENGINEERING_PROSE_MARKERS = re.compile(
    r"(?:"
    r"\b(?:Zusammenfassung|Begruendung|Begründung|Gepruefte|Geprüfte|Entscheidung|"
    r"Schwerpunkte|Statusautomat|Strippen|Clientpfad|Lieferstand|Metadatum|Interna|"
    r"der|die|das|den|dem|des|ein|eine|einen|einem|einer|ist|sind|wird|"
    r"werden|wurde|wurden|und|oder|ohne|mit|nicht|kein|keine|keinen|nur|wenn|"
    r"damit|dass|sonst|auch|dieser|diese|dieses|hier|dort|als|bei|beim|vom|"
    r"von|zum|zur|im|ins|am|auf|aus|gegen|zwischen|bereits|immer|spaeter|"
    r"später|fuer|für|ueber|über|wuerde|würde|koennte|könnte|koennen|können|"
    r"muessen|müssen|muesste|müsste|zurueck|zurück)\b|"
    r"(?:pruef|prüf|guelt|gült|unguelt|ungült|laesst|lässt|enthaelt|enthält|"
    r"abhaeng|abhäng|zulaess|zuläss|benoet|benöt|verschluessel|verschlüssel|"
    r"schluessel|schlüssel|eigentuemer|eigentümer|domaene|domäne|bedingung|"
    r"durchsetz|speicherbar|sortierbar|vollstaendig|vollständig|unveraendert|unverändert|"
    r"fehler|antwort|anbieter|gegenstelle|anmeldung|konto|sitzung|verbindung|referenz|"
    r"erzeugt|geaendert|geändert|pruefung|prüfung|wurzel|vertrag|abweichung|"
    r"verleiht|erlaubt|geworden)"
    r")",
    re.IGNORECASE,
)

# Identifier matching intentionally includes exact underscore-separated German
# words in addition to compound stems. The exact words below are regression
# markers from #214: they caught hybrid names such as ``upload_hoch``,
# ``test_png_als_jpeg_angekuendigt_scheitert`` and ``CANARY_FREMD`` that the
# original narrower audit missed.
IDENTIFIER_MARKERS = re.compile(
    r"(?:"
    r"(?:^|_)(?:der|die|das|ein|eine|ist|sind|wird|ohne|mit|nicht|kein|keine|"
    r"fuer|ueber|zurueck|antwort|fehler|anbieter|gegenstelle|anmeldung|konto|"
    r"sitzung|verbindung|schluessel|pruefung|wurzel|vertrag|erzeugt|geaendert|"
    r"unveraendert|welt|ort|plaene|erinnerung|meldungen|geheimnis|hoch|verarbeite|"
    r"validiert|projiziert|als|angekuendigt|scheitert|verleiht|ungebunden|"
    r"ungebundenen|sperrt|macht|sofort|unsichtbar|verlangt|aktuelle|entfernt|"
    r"ermittelt|bleibt|bekommt|braucht|liefert|traegt|zeigt|trifft|abgewiesen|"
    r"angelegt|geloescht|erstelle|fremd|unbekannt|gueltig|ungueltig|abgelaufen|"
    r"widerrufen|erneuern|schleife|grenze|familie|zeile|geraet|adresse|kopf|pfad|"
    r"sende|wunsch|loeschen|aendern|statuspruefung|versionspruefung|ressourcen)"
    r"(?:_|$)|"
    r"(?:schluessel|pruefung|ueberschreib|oeffentlich|begonnen|identitaet|"
    r"verknuepf|abgelehnt|unbekannt|falsch|gueltig|ungueltig|zurueck|"
    r"vollstaendig|unveraendert|erzeugt|geaendert)"
    r")",
    re.IGNORECASE,
)

# #231 closes a false-negative class left by the original marker-based audit:
# Python names may encode German words in CamelCase/PascalCase or in uppercase
# constants, so looking only for underscore-delimited words is insufficient.
# Split identifiers into semantic components first, then match only observed,
# unambiguous German engineering words/stems. Localized string literals are
# still handled separately and are not classified through this identifier path.
CAMEL_CASE_BOUNDARIES = (
    re.compile(r"(?<=[a-z0-9])(?=[A-Z])"),
    re.compile(r"(?<=[A-Z])(?=[A-Z][a-z])"),
)
IDENTIFIER_COMPONENT_WORDS = {
    "ableitung",
    "aeltesten",
    "anfrage",
    "anfragen",
    "anlegen",
    "anmeldung",
    "anzahl",
    "aufraeumen",
    "aufrufe",
    "begrenzt",
    "begrenzung",
    "behaelt",
    "beide",
    "beginn",
    "bereits",
    "bestaetigte",
    "bisherigen",
    "danach",
    "davor",
    "eigen",
    "einstellungen",
    "endlich",
    "endet",
    "endpunkte",
    "ergeben",
    "erhalten",
    "erkennbar",
    "erlaubt",
    "erster",
    "fehlversuch",
    "fenster",
    "frei",
    "fremder",
    "geheim",
    "gemeinsame",
    "geraeumt",
    "gerundet",
    "gesammelt",
    "gesendet",
    "gesperrt",
    "gezaehlt",
    "gleiche",
    "grenzen",
    "gutes",
    "historie",
    "instanz",
    "koordinaten",
    "kurzlebig",
    "lebensdauer",
    "lesen",
    "letzter",
    "mailversand",
    "mailweg",
    "mehreren",
    "mittleren",
    "nachgetragen",
    "nachrichten",
    "neues",
    "offen",
    "offene",
    "paralleler",
    "passwort",
    "passwoerter",
    "postfach",
    "praeferenz",
    "profil",
    "pruefen",
    "registrieren",
    "registrierung",
    "richtige",
    "rotiert",
    "rotationen",
    "rotationsflut",
    "schreibende",
    "schritt",
    "sechs",
    "seite",
    "selbst",
    "sieger",
    "signieren",
    "sitzungsverwaltung",
    "stellen",
    "transaktionsgrenze",
    "uhr",
    "verschiedene",
    "viele",
    "weiterhin",
    "wiederverwendung",
    "widerruf",
    "wirft",
    "zeitpunkt",
    "zunaechst",
    "zugeordnet",
    "zweiter",
}
IDENTIFIER_COMPONENT_STEMS = (
    "adressbestaetig",
    "ablauf",
    "anmeld",
    "aufraeum",
    "bestaetig",
    "einstell",
    "endpunkt",
    "erneuer",
    "geraeum",
    "gezaehl",
    "koordinat",
    "nachricht",
    "nachtrag",
    "passwoert",
    "registrier",
    "rotier",
    "schreibend",
    "signier",
    "sitzungsverwalt",
    "widerruf",
)

# This exact German phrase is deliberately retained as matching input in the
# status-drift migration compatibility regex and its corresponding unit test.
ALLOWED_LEGACY_INPUT = "Aktueller `main`"

# These exact values are localized product copy or intentionally German
# domain-content fixtures. Keeping the exception value-based rather than
# excluding whole test files still audits their engineering prose.
ALLOWED_LOCALIZED_TEXTS = (
    " im Park.",
    " war der Tag.",
    "Al dente mit Salbei",
    "Als gelesen markieren",
    "Am Abend saßen wir noch lange draußen und haben über die letzten Monate gesprochen.",
    "Am See",
    "Anmeldung fehlgeschlagen.",
    "ber den Dächern.",
    "Bild auswählen",
    "Danke für den schönen Abend.",
    "Danke, dass du heute einfach zugehört hast.",
    "Danke, dass du heute für mich da warst.",
    "Demnächst",
    "Dies ist das Profil, das dein Partner sieht.",
    "Diesen Monat",
    "Ein Jahr in unserer Wohnung",
    "Ein Moment",
    "Ein ruhiger Sonntagmorgen",
    "Ein Wochenende am Meer",
    "Ein Wochenende am Wasser",
    "Erinnerung mit Bild speichern",
    "Euer Moment",
    "Eure Story beginnt hier.",
    "Filmabend auf dem Sofa",
    "Filme für Regentage",
    "Flohmarkt am Samstag",
    "Geburtstag von Mira",
    "Gemeinsamer Moment",
    "Gerade bei euch",
    "Herbstwanderung",
    "Keine Einträge",
    "Kino-Abend mit Popcorn",
    "Kleine Alltagsmomente",
    "Konzert im Herbst",
    "Mitten in der Nacht sind wir aufgewacht, weil es draußen so heftig gewittert hat.",
    "Noch keine Einträge in eurer Story.",
    "Nur Text",
    "Pfingstrosen im Juni",
    "Picknick im Grünen",
    "Samstagmorgen war der Himmel klar und wir haben lange gefrühstückt, bevor wir losgezogen sind.",
    "Scharf mit Koriander",
    "von Alex",
    "von Lea",
    "von Sam",
    "Wir haben lange geschlafen und dann gemeinsam Pfannkuchen gemacht.",
    "Wochenendtrip an die Ostsee",
    "Zuletzt bei euch",
    "Über den Dächern.",
)

DIAGNOSTIC_CALLS = {"print", "fail", "skip", "xfail"}
DIAGNOSTIC_METHODS = {"debug", "info", "warning", "error", "exception", "critical"}


def _format_finding(path: Path, line_number: int, text: str) -> str:
    return f"{path}:{line_number}: {text.strip()}"


def _contains_marker(text: str) -> bool:
    sanitized = text.replace(ALLOWED_LEGACY_INPUT, "")
    for localized_text in ALLOWED_LOCALIZED_TEXTS:
        sanitized = sanitized.replace(localized_text, "")
    return ENGINEERING_PROSE_MARKERS.search(sanitized) is not None


def _identifier_components(identifier: str) -> list[str]:
    normalized = identifier
    for boundary in CAMEL_CASE_BOUNDARIES:
        normalized = boundary.sub("_", normalized)
    return [component.lower() for component in normalized.split("_") if component]


def _identifier_contains_marker(identifier: str) -> bool:
    if IDENTIFIER_MARKERS.search(identifier) is not None:
        return True
    for component in _identifier_components(identifier):
        if component in IDENTIFIER_COMPONENT_WORDS:
            return True
        if any(component.startswith(stem) for stem in IDENTIFIER_COMPONENT_STEMS):
            return True
    return False


def _literal_strings(node: ast.AST | None) -> list[tuple[int, str]]:
    if node is None:
        return []
    values: list[tuple[int, str]] = []
    for child in ast.walk(node):
        if isinstance(child, ast.Constant) and isinstance(child.value, str):
            values.append((child.lineno, child.value))
    return values


def _call_name(call: ast.Call) -> tuple[str | None, str | None]:
    if isinstance(call.func, ast.Name):
        return call.func.id, None
    if isinstance(call.func, ast.Attribute):
        return None, call.func.attr
    return None, None


def check_python_file(path: Path) -> list[str]:
    text = path.read_text(encoding="utf-8")
    lines = text.splitlines()
    findings: set[tuple[int, str]] = set()

    try:
        tokens = tokenize.generate_tokens(io.StringIO(text).readline)
        for token in tokens:
            is_engineering_comment = token.type == tokenize.COMMENT and _contains_marker(
                token.string
            )
            is_legacy_identifier = token.type == tokenize.NAME and _identifier_contains_marker(
                token.string
            )
            if is_engineering_comment or is_legacy_identifier:
                findings.add((token.start[0], token.string))
    except tokenize.TokenError:
        # Syntax/format checks will report malformed Python separately. Keep the
        # language audit useful rather than masking the primary error.
        pass

    try:
        tree = ast.parse(text)
    except SyntaxError:
        return [_format_finding(path, line, value) for line, value in sorted(findings)]

    for node in ast.walk(tree):
        if isinstance(node, (ast.Module, ast.ClassDef, ast.FunctionDef, ast.AsyncFunctionDef)):
            docstring = ast.get_docstring(node, clean=False)
            if docstring and _contains_marker(docstring):
                body = getattr(node, "body", [])
                line_number = body[0].lineno if body else getattr(node, "lineno", 1)
                findings.add((line_number, docstring.splitlines()[0]))

        if isinstance(node, ast.Assert):
            for line_number, value in _literal_strings(node.msg):
                if _contains_marker(value):
                    findings.add((line_number, value))

        if isinstance(node, ast.Raise):
            for line_number, value in _literal_strings(node.exc):
                if _contains_marker(value):
                    findings.add((line_number, value))

        if isinstance(node, ast.Call):
            name, method = _call_name(node)
            is_exception = bool(name and (name.endswith("Error") or name.endswith("Exception")))
            is_diagnostic = name in DIAGNOSTIC_CALLS or method in DIAGNOSTIC_METHODS or is_exception
            if is_diagnostic:
                arguments = [*node.args, *(keyword.value for keyword in node.keywords)]
                for argument in arguments:
                    for line_number, value in _literal_strings(argument):
                        if _contains_marker(value):
                            findings.add((line_number, value))
            if method == "raises":
                for keyword in node.keywords:
                    if keyword.arg == "match":
                        for line_number, value in _literal_strings(keyword.value):
                            if _contains_marker(value):
                                findings.add((line_number, value))

    return [
        _format_finding(
            path,
            line_number,
            lines[line_number - 1] if 0 < line_number <= len(lines) else value,
        )
        for line_number, value in sorted(findings)
    ]


def check_text_file(path: Path) -> list[str]:
    text = path.read_text(encoding="utf-8").replace(ALLOWED_LEGACY_INPUT, "")
    findings: list[str] = []
    for line_number, line in enumerate(text.splitlines(), start=1):
        if _contains_marker(line):
            findings.append(_format_finding(path, line_number, line))
    return findings


def check_file(path: Path) -> list[str]:
    return check_python_file(path) if path.suffix == ".py" else check_text_file(path)


def backend_files() -> list[Path]:
    files: list[Path] = []
    for root in BACKEND_ROOTS:
        if not root.is_dir():
            continue
        for path in root.rglob("*"):
            supported = path.suffix in BACKEND_SUFFIXES or path.name in BACKEND_FILENAMES
            if path.is_file() and supported:
                files.append(path)
    dockerfile = Path("backend/Dockerfile")
    if dockerfile.is_file():
        files.append(dockerfile)
    return sorted(set(files))


def _is_excluded_platform_path(path: Path) -> bool:
    return path in EXCLUDED_PLATFORM_PATHS or any(
        path == prefix or prefix in path.parents for prefix in EXCLUDED_PLATFORM_PREFIXES
    )


def platform_files() -> list[Path]:
    files: list[Path] = []
    for root in PLATFORM_ROOTS:
        if not root.is_dir():
            continue
        for path in root.rglob("*"):
            supported = path.suffix in PLATFORM_SUFFIXES or path.name in PLATFORM_FILENAMES
            if path.is_file() and supported and not _is_excluded_platform_path(path):
                files.append(path)
    return sorted(set(files))


def main() -> int:
    findings: list[str] = []
    for path in SCOPED_FILES:
        if not path.is_file():
            findings.append(f"{path}: required scoped file is missing")
            continue
        findings.extend(check_file(path))

    for path in sorted(set(backend_files()) | set(platform_files())):
        findings.extend(check_file(path))

    if findings:
        print(
            "Legacy engineering-language markers found in migrated developer surfaces:",
            file=sys.stderr,
        )
        for finding in findings:
            print(f"- {finding}", file=sys.stderr)
        return 1

    print(
        "Migrated developer, backend, client, CI, and deployment surfaces "
        "satisfy the scoped English-language audit."
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
