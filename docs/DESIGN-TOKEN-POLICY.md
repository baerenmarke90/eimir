# Semantic Design Token Policy

**Status:** Mandatory design-system guidance

## Purpose

eimir. uses semantic design tokens as the shared source for reusable visual decisions. Components consume meaning, not implementation values.

The goal is consistent theming, accessibility, maintainability, and predictable design evolution across clients.

## Rules

For reusable visual values:

- use centralized design tokens instead of repeated literals;
- name tokens by semantic purpose rather than the current value;
- consume tokens through `var(...)` in component styles;
- keep raw values at the token-definition boundary;
- tokenize values that affect themes, branding, or accessibility.

Examples:

Preferred:

```css
:root {
  --color-text-inverse-muted: rgb(255 255 255 / 90%);
}

.login-intro .eyebrow.eyebrow-inverse {
  color: var(--color-text-inverse-muted);
}
```

Avoid:

```css
.login-intro .eyebrow.eyebrow-inverse {
  color: rgb(255 255 255 / 90%);
}
```

Avoid implementation-oriented names when the semantic role is known:

- `--purple-600`
- `--white-90`
- `--spacing-18px`

Prefer:

- `--color-brand-strong`
- `--color-text-inverse-muted`
- `--space-section`

## Exceptions

A literal value is acceptable when it is genuinely local, not reusable, and introducing a token would add no semantic value.

This policy does not require creating tokens for every possible number or isolated implementation detail.

## Boundaries

- User-facing text remains in i18n resources and is unrelated to design-token policy.
- The existing CSS custom-property structure in `web/src/styles.css` is the current Web implementation basis and should be reused before creating new abstractions.
- Full replacement of existing literals is not required by this policy; future changes should follow this rule.

## Reference

Issue #221 is the motivating example: the login hero contrast correction uses a semantic token instead of adding another component-specific color literal.
