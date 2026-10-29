// @vitest-environment jsdom
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import {
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';
import type { PlacesApi } from '../api/generated/apis/PlacesApi';
import { ClientProblemError } from '../client/problemDetails';
import { i18n } from '../i18n';
import { PlaceMapPicker } from './PlaceMapPicker';

const mapState = vi.hoisted(() => ({ fail: false }));

vi.mock('./PlaceMapCanvas', () => ({
  default: ({
    onSelect,
  }: {
    onSelect: (point: { latitude: number; longitude: number }) => void;
  }) => {
    if (mapState.fail) throw new Error('Map module unavailable');
    return (
      <button
        type="button"
        onClick={() =>
          onSelect({ latitude: 54.31234567, longitude: 8.61234567 })
        }
      >
        Select map point
      </button>
    );
  },
}));
beforeAll(() => {
  HTMLDialogElement.prototype.showModal = function () {
    this.setAttribute('open', '');
  };
  HTMLDialogElement.prototype.close = function () {
    this.removeAttribute('open');
  };
});
beforeEach(() => {
  mapState.fail = false;
  window.history.replaceState(null, '', '/');
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

function setup(
  lookup = vi.fn(async () => ({
    items: [
      {
        name: 'Beach',
        address: 'Sankt Peter-Ording',
        latitude: 54.31,
        longitude: 8.61,
      },
    ],
  })),
) {
  const select = vi.fn();
  render(
    <MemoryRouter>
      <PlaceMapPicker
        api={{ lookupPlaces: lookup } as unknown as PlacesApi}
        spaceId="space-1"
        onSelect={select}
      />
    </MemoryRouter>,
  );
  return { lookup, select };
}
const label = (key: string) => i18n.t(`m5s3.map.${key}`);

describe('Place map choice task', () => {
  it('searches only after deliberate intent and commits only after confirmation', async () => {
    const { lookup, select } = setup();
    expect(lookup).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: label('open') }));
    expect(document.activeElement?.tagName).not.toBe('INPUT');
    expect(screen.queryByText('Select map point')).toBeNull();
    fireEvent.change(screen.getByRole('searchbox'), {
      target: { value: 'Beach' },
    });
    fireEvent.click(screen.getByRole('button', { name: label('search') }));
    fireEvent.click(
      await screen.findByRole('button', { name: /Beach.*Sankt Peter-Ording/ }),
    );
    expect(select).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: label('confirm') }));
    await waitFor(() =>
      expect(select).toHaveBeenCalledWith({
        name: 'Beach',
        address: 'Sankt Peter-Ording',
        latitude: 54.31,
        longitude: 8.61,
      }),
    );
    expect(lookup).toHaveBeenCalledWith(
      {
        spaceId: 'space-1',
        placeLookupRequest: { query: 'Beach', locale: expect.any(String) },
      },
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
  });
  it('allows keyboard/map-center selection and bounded coordinates without external search', async () => {
    const { lookup, select } = setup();
    fireEvent.click(screen.getByRole('button', { name: label('open') }));
    fireEvent.click(screen.getByRole('button', { name: label('loadMap') }));
    fireEvent.click(
      await screen.findByRole('button', { name: 'Select map point' }),
    );
    fireEvent.click(screen.getByRole('button', { name: label('confirm') }));
    await waitFor(() =>
      expect(select).toHaveBeenCalledWith({
        name: label('selectedLocation'),
        address: null,
        latitude: 54.312346,
        longitude: 8.612346,
      }),
    );
    expect(lookup).not.toHaveBeenCalled();
  });
  it('keeps search failure actionable and allows cancel without saving a location', async () => {
    const lookup = vi.fn().mockRejectedValue(new ClientProblemError('server'));
    const { select } = setup(lookup);
    fireEvent.click(screen.getByRole('button', { name: label('open') }));
    fireEvent.change(screen.getByRole('searchbox'), {
      target: { value: 'Beach' },
    });
    fireEvent.click(screen.getByRole('button', { name: label('search') }));
    await screen.findByText(i18n.t('states.server.title'));
    expect(screen.getByRole('searchbox').getAttribute('value')).toBe('Beach');
    fireEvent.click(
      screen.getByRole('button', { name: i18n.t('taskSheets.close') }),
    );
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(select).not.toHaveBeenCalled();
  });
});

it('contains a failed map module within the sheet and retries without losing its search or chosen place', async () => {
  vi.spyOn(console, 'error').mockImplementation(() => {});
  mapState.fail = true;
  setup();
  fireEvent.click(screen.getByRole('button', { name: label('open') }));
  fireEvent.change(screen.getByRole('searchbox'), {
    target: { value: 'Beach' },
  });
  fireEvent.click(screen.getByRole('button', { name: label('search') }));
  fireEvent.click(
    await screen.findByRole('button', { name: /Beach.*Sankt Peter-Ording/ }),
  );
  await screen.findByText(label('tileError'));
  expect((screen.getByRole('searchbox') as HTMLInputElement).value).toBe(
    'Beach',
  );
  expect(
    (screen.getByLabelText(i18n.t('m5s3.place.name')) as HTMLInputElement)
      .value,
  ).toBe('Beach');
  mapState.fail = false;
  fireEvent.click(screen.getByRole('button', { name: i18n.t('common.retry') }));
  await screen.findByText('Select map point');
  expect(screen.queryByText(label('tileError'))).toBeNull();
  expect(
    (screen.getByLabelText(i18n.t('m5s3.place.name')) as HTMLInputElement)
      .value,
  ).toBe('Beach');
});
