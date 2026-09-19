// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { StoryDetailPageShell } from './StoryDetailPageShell';

describe('StoryDetailPageShell', () => {
  it('preserves product-specific classes and container attributes', () => {
    const { container } = render(
      <StoryDetailPageShell
        eyebrow="A moment"
        title="Together"
        pageClassName="memory-product-page"
        containerClassName="memory-detail-container"
        containerProps={{ 'data-detail-kind': 'memory' }}
        articleClassName="memory-detail-card"
      >
        <p>Detail body</p>
      </StoryDetailPageShell>,
    );

    expect(container.querySelector('.page.memory-product-page')).not.toBeNull();
    expect(
      container.querySelector(
        '.memory-detail-container[data-detail-kind="memory"]',
      ),
    ).not.toBeNull();
    expect(
      container.querySelector(
        '.story-surface.memory-detail-card.coffee-table-layout',
      ),
    ).not.toBeNull();
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe(
      'Together',
    );
    expect(screen.getByText('Detail body')).not.toBeNull();
  });

  it('renders status content before the shared offline banner and header', () => {
    const { container } = render(
      <StoryDetailPageShell
        title="Offline detail"
        offline
        beforeHeader={<div data-testid="saved-status">Saved</div>}
        containerClassName="detail-container"
      >
        <p>Body</p>
      </StoryDetailPageShell>,
    );

    const page = container.querySelector('.page.product-detail-page');
    expect(page).not.toBeNull();
    const children = Array.from(page?.children ?? []);
    expect(children[0]).toBe(screen.getByTestId('saved-status'));
    expect(children[1]?.getAttribute('role')).toBe('status');
    expect(children[2]?.classList.contains('page-heading')).toBe(true);
  });
});
