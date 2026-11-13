// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it } from 'vitest';
import { useMediaReveal } from './useMediaReveal';

function Image({ src }: { src: string }) {
  const reveal = useMediaReveal(src);
  return <img alt="Shared moment" src={src} {...reveal} />;
}

afterEach(cleanup);

it('stays pending until the image has decoded, then reveals it', () => {
  const view = render(<Image src="blob:a" />);
  const image = screen.getByAltText('Shared moment');
  expect(image.dataset.mediaReveal).toBe('pending');
  fireEvent.load(image);
  expect(image.dataset.mediaReveal).toBe('ready');

  view.rerender(<Image src="blob:b" />);
  expect(image.dataset.mediaReveal).toBe('pending');
});

it('never keeps a failed image hidden', () => {
  render(<Image src="blob:broken" />);
  const image = screen.getByAltText('Shared moment');
  fireEvent.error(image);
  expect(image.dataset.mediaReveal).toBe('ready');
});
