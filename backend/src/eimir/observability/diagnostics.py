"""Privacy-safe technical diagnostics for logs and persisted failure state.

Unexpected exception text is untrusted runtime data. It can contain provider
bodies, database renderings, signed URLs, tokens, or private product content.
The generic exception boundary therefore never emits arbitrary exception text
and never treats a value as safe merely because it *looks* like a machine code.

A very small compatibility shim may recognize developer-authored constants
that were already part of the application's diagnostic contract, but the
returned summary is always a static literal. No value derived from
``str(exc)`` or from arbitrary exception arguments is copied into logs or
persistent diagnostics. Stable job/provider codes continue to use their
existing explicit typed paths.

Tracebacks retain bounded structural context (file basename, line number and
function name) but intentionally omit source-code lines. This keeps the stack
useful without copying another text surface into logs.
"""

from __future__ import annotations

import re
from collections import deque
from pathlib import Path
from types import TracebackType

_TECHNICAL_CODE = re.compile(r"[A-Z0-9_-]{1,64}\Z")

UNKNOWN_CODE = "UNKNOWN"

_MAX_CHAIN_DEPTH = 10
_MAX_TRACEBACK_FRAMES = 50
_MAX_TRACEBACK_CHARS = 20_000
_MAX_FRAME_NAME_CHARS = 128
_MAX_FILENAME_CHARS = 256

_CAUSE_HEADER = "\nThe above exception was the direct cause of the following exception:\n\n"
_CONTEXT_HEADER = "\nDuring handling of the above exception, another exception occurred:\n\n"


def sanitize_error_code(value: str, *, default: str = UNKNOWN_CODE) -> str:
    """Normalize a value already known by its caller to be a technical code.

    This helper is deliberately *not* an exception-message sanitizer. Callers
    must already own the authority to classify ``value`` as a technical code;
    arbitrary exception/provider prose must not be passed here as a way to
    decide whether it is safe.
    """
    candidate = value.strip().upper()
    if _TECHNICAL_CODE.fullmatch(candidate) is None:
        return default
    return candidate


def safe_exception_summary(exc: BaseException) -> str:
    """Return a bounded, privacy-safe one-line summary of ``exc``.

    The exception class name is developer-authored structural metadata.
    Arbitrary exception messages are never rendered or copied. Two legacy
    RuntimeError codes that pre-date this generic boundary are recognized only
    to preserve their existing diagnostic contract; even there the output is a
    static literal rather than data read back from the exception.

    Generic controlled retry/provider codes should continue to use their
    existing typed code paths rather than relying on this compatibility shim.
    """
    name = type(exc).__name__

    # Do not call str(exc): exception text is untrusted runtime data. The exact
    # built-in RuntimeError + one plain-string argument shape prevents custom
    # equality/formatting hooks from participating in this compatibility path,
    # and the emitted value is a static literal rather than the argument.
    if type(exc) is RuntimeError and len(exc.args) == 1 and type(exc.args[0]) is str:
        if exc.args[0] == "ACCOUNT_UNAVAILABLE":
            return "RuntimeError: ACCOUNT_UNAVAILABLE"
        if exc.args[0] == "ACCOUNT_DELETION_CONVERGENCE_FAILED":
            return "RuntimeError: ACCOUNT_DELETION_CONVERGENCE_FAILED"

    return name


def safe_traceback_text(
    exc_info: tuple[type[BaseException] | None, BaseException | None, TracebackType | None],
) -> str:
    """Render a bounded traceback without untrusted exception/source text.

    Cause/context relationships are preserved. Each stack retains only file
    basename, line number, and function name; literal source-code lines are not
    copied into the diagnostic. Exception messages are reduced through
    :func:`safe_exception_summary`.

    The renderer is bounded on chain depth, frames per traceback, frame-field
    length, and total output length. It never falls back to the stdlib's raw
    exception formatting if sanitization fails.
    """
    try:
        _, exc_value, _ = exc_info
        if exc_value is None:
            return ""
        rendered = "".join(_render_chain(exc_value, seen=set(), depth=0))
        if len(rendered) > _MAX_TRACEBACK_CHARS:
            rendered = rendered[:_MAX_TRACEBACK_CHARS] + "...<truncated>\n"
        return rendered
    except Exception:
        return "<traceback sanitization failed>"


def _render_chain(exc: BaseException, seen: set[int], depth: int) -> list[str]:
    if depth > _MAX_CHAIN_DEPTH or id(exc) in seen:
        return []
    seen.add(id(exc))

    lines: list[str] = []
    cause = exc.__cause__
    context = exc.__context__
    if cause is not None:
        lines.extend(_render_chain(cause, seen, depth + 1))
        lines.append(_CAUSE_HEADER)
    elif context is not None and not exc.__suppress_context__:
        lines.extend(_render_chain(context, seen, depth + 1))
        lines.append(_CONTEXT_HEADER)

    lines.append("Traceback (most recent call last):\n")
    lines.extend(_render_frames(exc.__traceback__))
    lines.append(safe_exception_summary(exc) + "\n")
    return lines


def _render_frames(tb: TracebackType | None) -> list[str]:
    """Render only structural frame metadata, keeping the tail nearest raise."""
    frames: deque[tuple[str, int, str]] = deque(maxlen=_MAX_TRACEBACK_FRAMES)
    cursor = tb
    while cursor is not None:
        code = cursor.tb_frame.f_code
        filename = Path(code.co_filename).name[:_MAX_FILENAME_CHARS] or "<unknown>"
        function = code.co_name[:_MAX_FRAME_NAME_CHARS] or "<unknown>"
        frames.append((filename, cursor.tb_lineno, function))
        cursor = cursor.tb_next

    return [
        f'  File "{filename}", line {line_number}, in {function}\n'
        for filename, line_number, function in frames
    ]
