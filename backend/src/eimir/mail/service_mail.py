# ruff: noqa: E501  (inline-styled HTML lines are intentionally kept whole for readability)
"""Shared layout for service mail: one calm look for every automatic message.

Authentication links, notifications and account notices answer the same
questions in the same order: what is this, what can I do, why did I get it and
what if it was not me. The sender identity and legal footer come from
configuration and are omitted rather than faked when unset.

Design decisions that are deliberate:

* **No remote images and no tracking.** The wordmark is text. A remote logo would
  tell a third party when the mail was opened and is blocked by default in most
  clients anyway.
* **The plain-text part is complete.** Text-only clients, accessibility digests
  and the development log read it; it is built from the same content as the HTML.
* **Colours come from the design tokens** through :class:`MailPalette`. Mail
  clients cannot read CSS variables, so the values are mirrored here and a unit
  test compares them with ``design/tokens.json``.
* **Copy never depends on private state.** Callers pass an i18n key prefix; the
  keys hold neutral text that fits every recipient of that mail.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import timedelta
from html import escape

from eimir.config import get_settings
from eimir.i18n import supported_locale, text
from eimir.mail.base import MailMessage


@dataclass(frozen=True)
class MailPalette:
    """Semantic colours of one colour scheme, mirrored from ``design/tokens.json``."""

    background: str
    card: str
    card_tint: str
    text_primary: str
    text_secondary: str
    border: str
    action: str
    on_action: str
    link: str
    brand_dot: str


LIGHT = MailPalette(
    background="#E6EBFA",
    card="#FFFFFF",
    card_tint="#F3F5FC",
    text_primary="#19233E",
    text_secondary="#58627B",
    border="#BBC9E5",
    action="#3055B8",
    on_action="#FFFFFF",
    link="#3055B8",
    brand_dot="#4C6ED0",
)
DARK = MailPalette(
    background="#171B2F",
    card="#303751",
    card_tint="#252B43",
    text_primary="#F6F7FF",
    text_secondary="#C4CEE8",
    border="#46506F",
    action="#B7C8FF",
    on_action="#171B2F",
    link="#B7C8FF",
    brand_dot="#B7C8FF",
)

_FONT = "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif"


@dataclass(frozen=True)
class _Footer:
    """Facts about the sender, resolved once per message."""

    provider: str
    imprint_url: str
    privacy_url: str
    terms_url: str
    support_email: str


def _footer() -> _Footer:
    settings = get_settings()
    base = settings.public_base_url.rstrip("/")
    # Only an eimir. Cloud deployment has terms and a privacy notice of its own.
    # A Self-Hosted operator names theirs explicitly or none is shown.
    from eimir.legal.terms import required_terms_version

    cloud = required_terms_version() is not None
    provider = ", ".join(
        part for part in (settings.legal_provider_name, settings.legal_provider_address) if part
    )
    return _Footer(
        provider=provider if settings.legal_provider_name else "",
        imprint_url=settings.legal_imprint_url,
        privacy_url=settings.legal_privacy_url or (f"{base}/legal/privacy" if cloud else ""),
        terms_url=settings.legal_terms_url or (f"{base}/legal/terms" if cloud else ""),
        support_email=settings.support_email,
    )


def _validity(lifetime: timedelta, locale: str) -> str:
    minutes = max(1, round(lifetime.total_seconds() / 60))
    if minutes % 60 == 0:
        count, unit = minutes // 60, "hour"
    else:
        count, unit = minutes, "minute"
    key = f"mail.validity.{unit}{'' if count == 1 else 's'}"
    return text(key, locale, count=str(count))


def _paragraphs(value: str) -> list[str]:
    return [part.strip() for part in value.split("\n\n") if part.strip()]


def service_mail(
    prefix: str,
    *,
    to: str,
    locale: str,
    url: str | None = None,
    lifetime: timedelta | None = None,
    service_key: str = "mail.service",
) -> MailMessage:
    """Build the localized HTML and plain-text message for one service mail.

    ``prefix`` selects the copy: ``<prefix>.subject``, ``.preheader``,
    ``.heading``, ``.intro``, ``.reason`` and ``.ignore`` always, ``.button``
    when ``url`` is given. A ``lifetime`` marks ``url`` as a one-time link: it then
    also shows the validity, a copyable fallback and the security tip.
    """
    language = supported_locale(locale) or "de"
    subject = text(f"{prefix}.subject", language)
    heading = text(f"{prefix}.heading", language)
    intro = text(f"{prefix}.intro", language)
    button = text(f"{prefix}.button", language) if url else None
    preheader = text(f"{prefix}.preheader", language)
    reason = text(f"{prefix}.reason", language)
    ignore = text(f"{prefix}.ignore", language)
    one_time = url is not None and lifetime is not None
    validity = _validity(lifetime, language) if one_time and lifetime else None
    fallback = text("mail.fallback", language) if one_time else None
    security = text("mail.security", language) if one_time else None
    service = text(service_key, language)
    tagline = text("mail.tagline", language)
    footer = _footer()

    privacy_note = text("mail.privacy", language) if footer.privacy_url else ""
    contact = (
        text("mail.contact", language, email=footer.support_email) if footer.support_email else ""
    )
    links = [
        (text("mail.link.privacy", language), footer.privacy_url),
        (text("mail.link.terms", language), footer.terms_url),
        (text("mail.link.imprint", language), footer.imprint_url),
    ]
    links = [(label, address) for label, address in links if address]
    provider = f"{text('mail.provider', language)}: {footer.provider}" if footer.provider else ""

    plain_lines = ["eimir.", tagline, "", heading, "", intro, ""]
    if url and button:
        plain_lines += [f"{button}:", url, ""]
    if validity:
        plain_lines += [validity, ""]
    if security:
        plain_lines += [security, ""]
    plain_lines += ["--", reason, ignore, service]
    if privacy_note:
        plain_lines += ["", privacy_note]
    plain_lines += [f"{label}: {address}" for label, address in links]
    if provider:
        plain_lines += ["", provider]
    if contact:
        plain_lines += [contact]
    body = "\n".join(plain_lines) + "\n"

    html = _render_html(
        language=language,
        subject=subject,
        preheader=preheader,
        tagline=tagline,
        heading=heading,
        intro_paragraphs=_paragraphs(intro),
        button=button,
        url=url,
        validity=validity,
        fallback=fallback,
        security=security,
        footer_paragraphs=[reason, ignore, service, privacy_note],
        links=links,
        provider=provider,
        contact=contact,
        support_email=footer.support_email,
    )
    return MailMessage(to=to, subject=subject, body=body, html=html, language=language)


def _style_rules(palette: MailPalette) -> str:
    """Dark-scheme overrides; clients without support simply keep the light scheme."""
    return (
        f".bg{{background:{palette.background} !important}}"
        f".card{{background:{palette.card} !important;border-color:{palette.border} !important}}"
        f".tint{{background:{palette.card_tint} !important;border-color:{palette.border} !important}}"
        f".t1{{color:{palette.text_primary} !important}}"
        f".t2{{color:{palette.text_secondary} !important}}"
        f".dot{{color:{palette.brand_dot} !important}}"
        f".link{{color:{palette.link} !important}}"
        f".btn{{background:{palette.action} !important;color:{palette.on_action} !important}}"
    )


def _render_html(
    *,
    language: str,
    subject: str,
    preheader: str,
    tagline: str,
    heading: str,
    intro_paragraphs: list[str],
    button: str | None,
    url: str | None,
    validity: str | None,
    fallback: str | None,
    security: str | None,
    footer_paragraphs: list[str],
    links: list[tuple[str, str]],
    provider: str,
    contact: str,
    support_email: str,
) -> str:
    light = LIGHT
    e = escape

    def paragraph(value: str, *, tone: str, size: int = 16, margin: int = 16) -> str:
        colour = light.text_primary if tone == "t1" else light.text_secondary
        return (
            f'<p class="{tone}" style="margin:0 0 {margin}px;font-size:{size}px;'
            f'line-height:1.55;color:{colour};">{e(value)}</p>'
        )

    intro = "".join(paragraph(value, tone="t1") for value in intro_paragraphs)
    footer_html = "".join(
        paragraph(value, tone="t2", size=13, margin=10) for value in footer_paragraphs if value
    )
    if provider:
        footer_html += paragraph(provider, tone="t2", size=13, margin=10)
    if contact:
        # ``contact`` still holds the address, so find it again in the escaped text
        # and turn exactly that occurrence into a mailto link.
        anchor = (
            f'<a class="link" href="mailto:{e(support_email, quote=True)}" '
            f'style="color:{light.link};">{e(support_email)}</a>'
        )
        footer_html += (
            f'<p class="t2" style="margin:0 0 10px;font-size:13px;line-height:1.55;'
            f'color:{light.text_secondary};">{e(contact).replace(e(support_email), anchor, 1)}</p>'
        )
    link_html = " &nbsp;·&nbsp; ".join(
        f'<a class="link" href="{e(address, quote=True)}" '
        f'style="color:{light.link};text-decoration:underline;">{e(label)}</a>'
        for label, address in links
    )
    if link_html:
        footer_html += (
            f'<p class="t2" style="margin:6px 0 0;font-size:13px;line-height:1.7;'
            f'color:{light.text_secondary};">{link_html}</p>'
        )

    action_html = ""
    if url and button:
        safe_url = e(url, quote=True)
        action_html = f"""<table role="presentation" cellspacing="0" cellpadding="0" border="0" style="margin:24px 0 8px;"><tr><td align="center" class="btn" bgcolor="{light.action}" style="background:{light.action};border-radius:999px;">
<a class="btn" href="{safe_url}" style="display:inline-block;padding:15px 30px;font-family:{_FONT};font-size:16px;font-weight:700;line-height:1.2;color:{light.on_action};text-decoration:none;border-radius:999px;background:{light.action};">{e(button)}</a>
</td></tr></table>
"""
        if validity:
            action_html += paragraph(validity, tone="t2", size=14, margin=20) + "\n"
        if fallback:
            action_html += f"""<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0"><tr><td class="tint" style="background:{light.card_tint};border:1px solid {light.border};border-radius:16px;padding:14px 16px;">
<p class="t2" style="margin:0 0 6px;font-size:13px;line-height:1.5;color:{light.text_secondary};">{e(fallback)}</p>
<p style="margin:0;font-size:13px;line-height:1.5;"><a class="link" href="{safe_url}" style="color:{light.link};word-break:break-all;">{e(url)}</a></p>
</td></tr></table>
"""
        if security:
            action_html += f"""<p class="t2" style="margin:20px 0 0;font-size:14px;line-height:1.55;color:{light.text_secondary};">{e(security)}</p>
"""
    return f"""<!doctype html>
<html lang="{e(language)}" xmlns="http://www.w3.org/1999/xhtml">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light dark">
<meta name="supported-color-schemes" content="light dark">
<meta name="x-apple-disable-message-reformatting">
<title>{e(subject)}</title>
<style>
body{{margin:0;padding:0;-webkit-text-size-adjust:100%;}}
a{{word-break:break-word;}}
@media (max-width:600px){{.wrap{{padding:16px 12px !important}}.pad{{padding:28px 20px !important}}}}
@media (prefers-color-scheme:dark){{{_style_rules(DARK)}}}
</style>
</head>
<body class="bg" style="margin:0;padding:0;background:{light.background};">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;mso-hide:all;">{e(preheader)}{"&nbsp;&zwnj;" * 40}</div>
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" class="bg" style="background:{light.background};">
<tr><td align="center" class="wrap" style="padding:32px 16px;">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="max-width:560px;">
<tr><td style="padding:0 4px 18px;font-family:{_FONT};">
<span class="t1" style="font-size:28px;font-weight:800;letter-spacing:-0.5px;color:{light.text_primary};">eimir<span class="dot" style="color:{light.brand_dot};">.</span></span><br>
<span class="t2" style="font-size:13px;color:{light.text_secondary};">{e(tagline)}</span>
</td></tr>
<tr><td class="card pad" style="background:{light.card};border:1px solid {light.border};border-radius:24px;padding:36px 32px;font-family:{_FONT};">
<h1 class="t1" style="margin:0 0 16px;font-size:26px;line-height:1.25;font-weight:800;color:{light.text_primary};">{e(heading)}</h1>
{intro}
{action_html}</td></tr>
<tr><td style="padding:22px 8px 0;font-family:{_FONT};">
{footer_html}
</td></tr>
</table>
</td></tr>
</table>
</body>
</html>
"""
