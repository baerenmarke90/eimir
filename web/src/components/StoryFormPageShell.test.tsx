// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import {
  StoryCreatePageShell,
  StoryEditorPageShell,
} from './StoryFormPageShell';

describe('StoryEditorPageShell', () => {
  it('renders the shared editor page/header/sheet contract', () => {
    const { container } = render(
      <StoryEditorPageShell
        before={<button type="button">Back</button>}
        eyebrow="Edit"
        title="Memory"
        description="Change the details"
        headerClassName="create-heading"
        sectionLabelledBy="editor-heading"
        sectionHeading="Edit form"
      >
        <form>Fields</form>
      </StoryEditorPageShell>,
    );

    expect(
      container.querySelector(
        '.page.page-reading.create-page.product-editor-page',
      ),
    ).not.toBeNull();
    expect(
      container.querySelector('.page-heading.create-heading'),
    ).not.toBeNull();
    expect(
      container.querySelector(
        '.form-card.product-sheet[aria-labelledby="editor-heading"]',
      ),
    ).not.toBeNull();
    expect(screen.getByText('Edit form').classList.contains('sr-only')).toBe(
      true,
    );
    expect(screen.getByText('Fields')).not.toBeNull();
  });
});

describe('StoryCreatePageShell', () => {
  it('preserves product-specific page/card classes and header ordering', () => {
    const { container } = render(
      <StoryCreatePageShell
        header={<header data-testid="custom-header">Header</header>}
        pageClassName="heart-moment-create-page"
        cardClassName="heart-moment-create-card"
        labelledBy="create-heading"
      >
        <form>Fields</form>
      </StoryCreatePageShell>,
    );

    const page = container.querySelector(
      '.page.page-reading.create-page.heart-moment-create-page',
    );
    expect(page).not.toBeNull();
    const children = Array.from(page?.children ?? []);
    expect(children[0]).toBe(screen.getByTestId('custom-header'));
    expect(
      container.querySelector(
        '.immersive-create-card.eimir-motion-reveal.heart-moment-create-card[aria-labelledby="create-heading"]',
      ),
    ).not.toBeNull();
  });
});
