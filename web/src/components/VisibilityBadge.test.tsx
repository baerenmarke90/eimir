import '../i18n';
// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import relationshipComponents from '../i18n/locales/relationshipComponents';
import { VisibilityBadge } from './VisibilityBadge';

describe('VisibilityBadge', () => {
  afterEach(() => {
    cleanup();
  });

  it('renders shared badge for SPACE_SHARED with correct text and class', () => {
    const { container } = render(<VisibilityBadge visibility="SPACE_SHARED" />);

    const badge = screen.getByRole('status', {
      name: relationshipComponents.visibilityShared,
    });
    expect(badge).toBeDefined();
    expect(badge.className).toContain('visibility-shared');
    expect(
      container.querySelector('.visibility-badge-label')?.textContent,
    ).toBe(relationshipComponents.visibilityShared);
  });

  it('renders private badge for OWNER_ONLY with correct text and class', () => {
    const { container } = render(<VisibilityBadge visibility="OWNER_ONLY" />);

    const badge = screen.getByRole('status', {
      name: relationshipComponents.visibilityPrivate,
    });
    expect(badge).toBeDefined();
    expect(badge.className).toContain('visibility-private');
    expect(
      container.querySelector('.visibility-badge-label')?.textContent,
    ).toBe(relationshipComponents.visibilityPrivate);
  });

  it('renders temporary shared badge for TEMPORARY_SHARED', () => {
    render(<VisibilityBadge visibility="TEMPORARY_SHARED" />);

    const badge = screen.getByRole('status', {
      name: relationshipComponents.visibilityTemporary,
    });
    expect(badge).toBeDefined();
    expect(badge.className).toContain('visibility-temporary');
  });

  it('hides label when showLabel is false but retains accessible title/aria-label', () => {
    const { container } = render(
      <VisibilityBadge visibility="SPACE_SHARED" showLabel={false} />,
    );

    const badge = screen.getByRole('status', {
      name: relationshipComponents.visibilityShared,
    });
    expect(badge).toBeDefined();
    expect(container.querySelector('.visibility-badge-label')).toBeNull();
  });

  it('accepts custom label override', () => {
    const { container } = render(
      <VisibilityBadge visibility="OWNER_ONLY" customLabel="Custom draft" />,
    );

    expect(
      container.querySelector('.visibility-badge-label')?.textContent,
    ).toBe('Custom draft');
  });

  it('renders a subdued, non-pill status when variant is subtle (#1014)', () => {
    render(<VisibilityBadge visibility="SPACE_SHARED" variant="subtle" />);

    const badge = screen.getByRole('status', {
      name: relationshipComponents.visibilityShared,
    });
    expect(badge.className).toContain('visibility-badge-subtle');
    expect(
      screen.getByText(relationshipComponents.visibilityShared),
    ).toBeTruthy();
  });
});
