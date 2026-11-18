// @vitest-environment jsdom
import { cleanup, fireEvent, render } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import type { PersonRole } from '../client/personColours';
import { PartnerMarker } from './PartnerMarker';

const OWN: PersonRole = 'own';
const PARTNER: PersonRole = 'partner';

describe('PartnerMarker', () => {
  afterEach(cleanup);

  it('shows the initials when no picture is known', () => {
    const { container } = render(
      <PartnerMarker name="Lea Sommer" role={OWN} />,
    );
    const marker = container.querySelector('.partner-marker');
    expect(marker?.textContent).toBe('LS');
    expect(marker?.querySelector('img')).toBeNull();
  });

  it('shows the profile picture and keeps it decorative', () => {
    const { container } = render(
      <PartnerMarker name="Alex" role={PARTNER} imageUrl="blob:alex" />,
    );
    const marker = container.querySelector('.partner-marker');
    const image = marker?.querySelector('img');
    expect(marker?.getAttribute('aria-hidden')).toBe('true');
    expect(marker?.classList.contains('has-image')).toBe(true);
    expect(image?.getAttribute('src')).toBe('blob:alex');
    expect(image?.getAttribute('alt')).toBe('');
  });

  it('falls back to the initials when the picture cannot be shown', () => {
    const { container } = render(
      <PartnerMarker name="Alex" role={PARTNER} imageUrl="blob:broken" />,
    );
    const image = container.querySelector('img');
    if (!image) throw new Error('expected an image');
    fireEvent.error(image);
    expect(container.querySelector('img')).toBeNull();
    expect(container.querySelector('.partner-marker')?.textContent).toBe('AL');
  });
});
