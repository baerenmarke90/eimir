import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { DestinationIcon } from './DestinationIcon';
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

  it('keeps a gradient on the selected Planning destination', () => {
    const markup = renderToStaticMarkup(
      <DestinationIcon icon="plan" variant="filled" />,
    );
    expect(markup).toMatch(/<rect[^>]+fill="url\(#([^)]+)-cool\)"/);
    expect(markup).toContain('var(--identity-icon-cool-fill)');
  });

  it('uses the small icon treatment by default and keeps the detailed Pro artwork', () => {
    const badge = renderToStaticMarkup(<EimirIcon name="pro" />);
    const detailed = renderToStaticMarkup(
      <EimirIcon name="pro" variant="duotone" compact={false} />,
    );
    expect(badge).toContain('eimir-icon-compact');
    expect(badge).not.toContain('<circle');
    expect(detailed).not.toContain('eimir-icon-compact');
    expect(detailed).toContain('var(--identity-icon-cool-fill)');
  });

  it('renders the Insights bubble with a gradient and a visible waveform', () => {
    const markup = renderToStaticMarkup(
      <DestinationIcon icon="insights" variant="duotone" />,
    );
    expect(markup).toContain('eimir-icon-insights');
    expect(markup).toMatch(/<path[^>]+fill="url\(#([^)]+)-cool-warm\)"/);
    expect(markup.match(/<path\b/g)).toHaveLength(2);
    expect(markup).not.toContain('<rect');
    expect(markup).toContain('aria-hidden="true"');
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
