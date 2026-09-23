import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { EimirIcon, type EimirIconName } from './EimirIcon';

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
});
