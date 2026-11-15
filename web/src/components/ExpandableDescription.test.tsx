// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import {
  readableDescription,
  descriptionExcerpt,
} from '../client/readableDescription';
import copy from '../i18n/locales/storyProducts';
import { ExpandableDescription } from './ExpandableDescription';

afterEach(cleanup);

it('bounds long prose and preserves the full text through accessible expand and collapse', () => {
  const text = 'A shared evening with time to talk. '.repeat(30);
  render(<ExpandableDescription text={text} scope="memory-one" />);
  const more = screen.getByRole('button', {
    name: copy.descriptionDisclosure.more,
  });
  const id = more.getAttribute('aria-controls');
  expect(more.getAttribute('aria-expanded')).toBe('false');
  expect(document.getElementById(id ?? '')?.textContent?.length).toBeLessThan(
    365,
  );
  more.focus();
  fireEvent.click(more);
  expect(more.getAttribute('aria-expanded')).toBe('true');
  expect(document.getElementById(id ?? '')?.textContent).toBe(text);
  fireEvent.click(more);
  expect(document.activeElement).toBe(more);
  expect(more.getAttribute('aria-expanded')).toBe('false');
});

it('offers no disclosure for short prose and resets expansion when content ownership changes', () => {
  const view = render(<ExpandableDescription text="A quiet afternoon." />);
  expect(screen.queryByRole('button')).toBeNull();
  const long = 'A different account and moment. '.repeat(30);
  view.rerender(<ExpandableDescription text={long} scope="account-one" />);
  fireEvent.click(screen.getByRole('button'));
  expect(screen.getByRole('button').getAttribute('aria-expanded')).toBe('true');
  view.rerender(<ExpandableDescription text={long} scope="account-two" />);
  expect(screen.getByRole('button').getAttribute('aria-expanded')).toBe(
    'false',
  );
});

it('reads pasted HTML as text and safe links without scripts, embedded content or event handlers', () => {
  const text =
    '<p>A shared evening&nbsp;outside.</p><script>secret()</script><img src="https://unwanted.test/pixel"><iframe src="https://unwanted.test"></iframe><p><a href="https://example.org/event" onclick="secret()">Our plan</a><a href="javascript:secret()">Unsafe</a></p>';
  const request = vi.spyOn(globalThis, 'fetch');
  try {
    const readable = readableDescription(text);
    expect(readable).toContain('A shared evening outside.');
    expect(readable).toContain('Our plan (https://example.org/event)');
    expect(readable).not.toContain('secret()');
    const { container } = render(<ExpandableDescription text={text} />);
    expect(container.querySelector('script,img,iframe,[onclick]')).toBeNull();
    expect(screen.getByRole('link').getAttribute('href')).toBe(
      'https://example.org/event',
    );
    expect(request).not.toHaveBeenCalled();
  } finally {
    request.mockRestore();
  }
});

it('bounds sparse multiline descriptions and never clips a URL into another destination', () => {
  expect(descriptionExcerpt('One\n\nTwo\n\nThree\n\nFour')).not.toContain(
    'Four',
  );
  const url = `https://example.org/${'path'.repeat(110)}`;
  expect(descriptionExcerpt(`Our place ${url} later`)).toBe('Our place…');
  expect(descriptionExcerpt(url)).toBe(url);
  expect(readableDescription('A <3 B and 5 < 7')).toBe('A <3 B and 5 < 7');
});
