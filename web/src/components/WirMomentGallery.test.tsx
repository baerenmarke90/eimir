// @vitest-environment jsdom
import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import type { DashboardMedia } from '../api/generated/models/DashboardMedia';
import { MediaType } from '../api/generated/models/MediaType';
import { WirMomentSlides } from './WirMomentGallery';

const media: DashboardMedia[] = [
  { attachmentId: 'a-photo', mediaType: MediaType.IMAGE },
  { attachmentId: 'b-clip', mediaType: MediaType.VIDEO },
  { attachmentId: 'c-photo', mediaType: MediaType.IMAGE },
  { attachmentId: 'd-photo', mediaType: MediaType.IMAGE },
];

// Pictures never resolve here: the structure, not the bytes, is under test.
const loadImage = () => new Promise<never>(() => undefined);

afterEach(cleanup);

function slides(index: number, previous: number | null) {
  return render(
    <WirMomentSlides
      memoryId="memory-1"
      media={media}
      index={index}
      previous={previous}
      running
      preloadNext
      clipsAllowed={false}
      loadImage={loadImage}
      onClipEnded={() => undefined}
    />,
  ).container.querySelectorAll('.wir-moment-slide');
}

describe('WirMomentSlides', () => {
  it('keeps the picture on show, the one fading out and the next one warm', () => {
    const rendered = slides(1, 0);
    expect(
      [...rendered].map((slide) => slide.getAttribute('data-state')),
    ).toEqual(['leaving', 'active', 'next']);
  });

  it('exposes only the picture on show to assistive technology', () => {
    const rendered = [...slides(1, 0)];
    expect(rendered.map((slide) => slide.getAttribute('aria-hidden'))).toEqual([
      'true',
      null,
      'true',
    ]);
  });

  it('does not animate the first picture in, only the ones that follow', () => {
    expect(slides(0, null)[0]?.hasAttribute('data-entering')).toBe(false);
    cleanup();
    expect(
      [...slides(2, 1)]
        .find((slide) => slide.getAttribute('data-state') === 'active')
        ?.hasAttribute('data-entering'),
    ).toBe(true);
  });

  it('wraps to the first picture after the last', () => {
    const states = [...slides(3, 2)].map((slide) =>
      slide.getAttribute('data-state'),
    );
    expect(states).toEqual(['next', 'leaving', 'active']);
  });
});
