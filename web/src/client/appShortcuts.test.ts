import { expect, it } from 'vitest';
import { readAppShortcut } from './appShortcuts';

it.each([
  null,
  {},
  { id: 'arbitrary-url', action: 'moment' },
  { id: '00000000-0000-4000-8000-000000000001', action: '/more/private' },
  { id: '00000000-0000-4000-8000-000000000001', action: '__proto__' },
])('rejects malformed or unrecognized native input: %j', (value) => {
  expect(readAppShortcut(value)).toBeNull();
});
