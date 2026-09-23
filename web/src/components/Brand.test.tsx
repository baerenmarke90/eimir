import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { Brand, PRODUCT_NAME } from './Brand';

describe('Brand', () => {
  it('renders the canonical accessible product link with a decorative mark', () => {
    const html = renderToStaticMarkup(
      <MemoryRouter>
        <Brand to="/story" ariaLabel="Open eimir. Story" />
      </MemoryRouter>,
    );

    expect(PRODUCT_NAME).toBe('eimir.');
    expect(html).toContain('href="/story"');
    expect(html).toContain('aria-label="Open eimir. Story"');
    expect(html).toContain('aria-hidden="true"');
    expect(html).toContain('src="/identity/app-icon-light.svg"');
    expect(html).toContain('src="/identity/app-icon-dark.svg"');
    expect(html).toContain('alt=""');
    expect(html).toContain('eimir');
    expect(html).toContain('brand-dot');
    expect(html).not.toContain('SidebySide');
    expect(html).not.toContain('Eimir');
  });

  it('renders standard high-contrast brand styling by default', () => {
    const html = renderToStaticMarkup(<Brand />);

    expect(html).toContain('class="brand brand-static"');
    expect(html).not.toContain('brand-inverse');
  });
});
