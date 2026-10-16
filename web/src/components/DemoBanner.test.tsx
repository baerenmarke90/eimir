import { renderToStaticMarkup } from 'react-dom/server';
import { DemoBanner } from './DemoBanner';

describe('DemoBanner', () => {
  it('shows the configured automatic reset interval', () => {
    const html = renderToStaticMarkup(
      <DemoBanner resetTimerEnabled resetInterval="6h" />,
    );

    expect(html).toContain('Demo-Instanz');
    expect(html).toContain('6 Stunden');
    expect(html).toContain('automatisch');
  });

  it('reports a disabled reset timer without claiming a cadence', () => {
    const html = renderToStaticMarkup(
      <DemoBanner resetTimerEnabled={false} resetInterval="6h" />,
    );

    expect(html).toContain('deaktiviert');
    expect(html).not.toContain('6 Stunden');
  });

  it.each([
    ['30m', '30 Minuten'],
    ['1h', '1 Stunde'],
    ['1d', '1 Tag'],
  ])('formats %s from deployment configuration', (raw, expected) => {
    const html = renderToStaticMarkup(
      <DemoBanner resetTimerEnabled resetInterval={raw} />,
    );

    expect(html).toContain(expected);
  });
});
