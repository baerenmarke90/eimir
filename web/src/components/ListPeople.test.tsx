// @vitest-environment jsdom
import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { ListPeople } from './ListPeople';

afterEach(cleanup);

describe('ListPeople (#1808)', () => {
  it('shows one disc with initials per person and hides them from assistive technology', () => {
    const { container } = render(
      <ListPeople
        people={[
          { personId: 'anna', displayName: 'Anna Berg', tone: 'a' },
          { personId: 'ben', displayName: 'Ben', tone: 'b' },
        ]}
      />,
    );
    const group = container.querySelector('.list-people');
    expect(group?.getAttribute('aria-hidden')).toBe('true');
    const discs = [...container.querySelectorAll('.partner-marker')];
    expect(discs.map((disc) => disc.textContent)).toEqual(['AB', 'BE']);
    expect(discs[0].className).toContain('partner-marker-a');
    expect(discs[1].className).toContain('partner-marker-b');
  });

  it('renders nothing when nobody is known', () => {
    const { container } = render(<ListPeople people={[]} />);
    expect(container.firstChild).toBeNull();
  });
});
