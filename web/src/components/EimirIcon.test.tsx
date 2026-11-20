import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { EIMIR_ICON_NAMES, EimirIcon, type EimirIconName } from './EimirIcon';

describe('owner identity icons', () => {
  it('delivers artwork for all six owner-shown filled and duotone motifs', () => {
    const examples: EimirIconName[] = [
      'wir',
      'momente',
      'kalender',
      'reisen',
      'highlights',
      'nurfuer',
    ];
    for (const name of examples) {
      for (const variant of ['filled', 'duotone'] as const) {
        const markup = renderToStaticMarkup(
          <EimirIcon name={name} variant={variant} />,
        );
        expect(markup).toContain('fill="url(#');
      }
    }
  });

  it('delivers distinct filled and duotone heart artwork with resolvable gradients', () => {
    const markup = renderToStaticMarkup(
      <>
        <EimirIcon name="momente" variant="filled" />
        <EimirIcon name="momente" variant="duotone" />
      </>,
    );
    const gradientIds = [
      ...markup.matchAll(/<linearGradient id="([^"]+)"/g),
    ].map((match) => match[1]);
    const references = [...markup.matchAll(/fill="url\(#([^)]+)\)"/g)].map(
      (match) => match[1],
    );

    expect(gradientIds.length).toBeGreaterThan(0);
    expect(new Set(gradientIds).size).toBe(gradientIds.length);
    expect(references.every((id) => gradientIds.includes(id))).toBe(true);
    expect(markup).toContain('icon-pressed-detail');
    expect(markup).toContain('eimir-icon-duotone');
    expect(markup).toContain('aria-hidden="true"');
  });

  it('keeps every glyph distinct, so no mark stands in for another (#1907 C3)', () => {
    const shapes = new Map<string, EimirIconName>();
    for (const name of EIMIR_ICON_NAMES) {
      // Deliberate aliases: the Planen calendar and the privacy settings lock.
      if (name === 'kalender' || name === 'privatsphaere') continue;
      const shape = renderToStaticMarkup(<EimirIcon name={name} />).replace(
        /class="eimir-icon[^"]*"/,
        '',
      );
      expect(shapes.get(shape), name).toBeUndefined();
      shapes.set(shape, name);
    }
  });

  it('draws the private lock with a heart in every variant (#1907 C3)', () => {
    for (const variant of ['outline', 'filled', 'duotone'] as const) {
      const markup = renderToStaticMarkup(
        <EimirIcon name="nurfuer" variant={variant} />,
      );
      expect(markup).toContain('M12 18.6s-3.3-2-3.3-4.2');
      expect(markup).not.toContain('M12 14v4m-2-2h4');
    }
  });
});
