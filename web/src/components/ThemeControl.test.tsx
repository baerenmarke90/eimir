import { renderToStaticMarkup } from 'react-dom/server';
import { ThemeControl } from './ThemeControl';

describe('ThemeControl', () => {
  it('keeps the default runtime mount nonvisual', () => {
    expect(renderToStaticMarkup(<ThemeControl />)).toBe('');
  });

  it('renders the existing preference selector when requested by Profile', () => {
    const html = renderToStaticMarkup(<ThemeControl variant="inline" />);

    expect(html).toContain('id="theme-preference"');
    expect(html).toContain('value="system"');
    expect(html).toContain('value="light"');
    expect(html).toContain('value="dark"');
  });
});
