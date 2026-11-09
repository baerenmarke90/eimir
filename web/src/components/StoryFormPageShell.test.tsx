// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react';
import type { FormEvent } from 'react';
import { describe, expect, it } from 'vitest';
import {
  StoryCreatePageShell,
  StoryEditorPageShell,
  ComposerHeader,
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
        '.immersive-create-card.heart-moment-create-card[aria-labelledby="create-heading"]',
      ),
    ).not.toBeNull();
  });
});

it('submits the owning native form from the compact header', () => {
  const submit = vi.fn((event: FormEvent<HTMLFormElement>) =>
    event.preventDefault(),
  );
  render(
    <>
      <ComposerHeader
        before={<button type="button">Back</button>}
        title="Memory"
        titleId="memory-title"
        action={
          <button type="submit" form="memory-form">
            Save
          </button>
        }
      />
      <form id="memory-form" onSubmit={submit}>
        <input
          name="title"
          aria-label="Title"
          required
          defaultValue="Our day"
        />
      </form>
    </>,
  );
  const save = screen.getByRole('button', {
    name: 'Save',
  }) as HTMLButtonElement;
  expect(save.form?.id).toBe('memory-form');
  expect(screen.getByRole('heading', { name: 'Memory' }).id).toBe(
    'memory-title',
  );
  fireEvent.click(save);
  expect(submit).toHaveBeenCalledOnce();
});
