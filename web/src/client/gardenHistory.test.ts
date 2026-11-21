import { describe, expect, it } from 'vitest';
import type { GardenHistoryEntry } from '../api/generated/models/GardenHistoryEntry';
import { i18n } from '../i18n';
import games from '../i18n/locales/games';
import { historyDayLabel, historyDays, historyLine } from './gardenHistory';

const copy = games.garden;
const history = copy.history;
const t = i18n.getFixedT('de');
const ME = 'me';
const PARTNER = 'partner';
const NAMES = { own: 'Lea', partner: 'Alex' };
const TODAY = new Date('2026-11-16T00:00:00Z');

const entry = (
  overrides: Partial<GardenHistoryEntry> & Pick<GardenHistoryEntry, 'kind'>,
): GardenHistoryEntry => ({
  key: `${overrides.kind}:${Math.random()}`,
  happenedOn: TODAY,
  ...overrides,
});

const fill = (template: string, name = 'Alex') =>
  template.replace('{{name}}', name);

describe('garden history wording', () => {
  it('labels today, yesterday and older days of the couple', () => {
    expect(historyDayLabel(TODAY, TODAY, t)).toBe(history.today);
    expect(
      historyDayLabel(new Date('2026-11-15T00:00:00Z'), TODAY, t, 'de'),
    ).toBe(history.yesterday);
    expect(
      historyDayLabel(new Date('2026-11-10T00:00:00Z'), TODAY, t, 'de'),
    ).toBe('Di., 10. November');
    expect(
      historyDayLabel(new Date('2025-12-24T00:00:00Z'), TODAY, t, 'de'),
    ).toBe('Mi., 24. Dezember 2025');
  });

  it('tells a seed from either side, with its words', () => {
    const own = historyLine(
      entry({
        kind: 'SEED_SENT',
        actorId: ME,
        senderId: ME,
        species: 'POPPY',
        words: 'MISS_YOU',
      }),
      ME,
      NAMES,
      t,
    );
    expect(own.text).toBe(fill(history.seedSentOwn));
    expect(own.role).toBe('own');
    expect(own.detail).toBe(copy.species.POPPY.name);
    expect(own.words).toBe('MISS_YOU');
    const partner = historyLine(
      entry({ kind: 'SEED_SENT', actorId: PARTNER, senderId: PARTNER }),
      ME,
      NAMES,
      t,
    );
    expect(partner.text).toBe(fill(history.seedSentPartner));
    expect(partner.role).toBe('partner');
  });

  it('keeps the words of a waiting seed folded even if they arrive', () => {
    const line = historyLine(
      entry({
        kind: 'SEED_SENT',
        actorId: PARTNER,
        senderId: PARTNER,
        species: 'BELLFLOWER',
        words: 'FOR_YOU',
        waiting: true,
      }),
      ME,
      NAMES,
      t,
    );
    expect(line.words).toBeNull();
    expect(line.detail).toBe(
      `${copy.species.BELLFLOWER.name} · ${history.seedWaiting}`,
    );
  });

  it('names who planted, or that a seed found its place by itself', () => {
    const byMe = historyLine(
      entry({ kind: 'SEED_PLANTED', actorId: ME, senderId: PARTNER }),
      ME,
      NAMES,
      t,
    );
    expect(byMe.text).toBe(fill(history.plantedOwn));
    const itself = historyLine(
      entry({ kind: 'SEED_PLANTED', actorId: null, senderId: ME }),
      ME,
      NAMES,
      t,
    );
    expect(itself.text).toBe(history.plantedItselfOwn);
    expect(itself.role).toBe('own');
  });

  it('reveals a moonflower only with its first bloom', () => {
    const wrapped = historyLine(
      entry({
        kind: 'SEED_SENT',
        actorId: PARTNER,
        senderId: PARTNER,
        species: 'SURPRISE',
      }),
      ME,
      NAMES,
      t,
    );
    expect(wrapped.detail).toBe(copy.species.SURPRISE.name);
    expect(wrapped.marks).toEqual([{ species: 'SURPRISE', role: 'partner' }]);
    const bloom = historyLine(
      entry({ kind: 'FIRST_BLOOM', senderId: PARTNER, species: 'MOONFLOWER' }),
      ME,
      NAMES,
      t,
    );
    expect(bloom.text).toBe(fill(history.bloomPartner));
    expect(bloom.detail).toBe(history.moonflowerRevealed);
  });

  it('tells moments both shared without a single colour', () => {
    for (const kind of ['SHARED_DAY', 'WATERED_TOGETHER'] as const) {
      const line = historyLine(entry({ kind }), ME, NAMES, t);
      expect(line.role).toBe('both');
      expect(line.marks).toEqual([]);
    }
    const watered = historyLine(
      entry({
        kind: 'WATERED',
        actorId: PARTNER,
        senderId: ME,
        species: 'STARFLOWER',
      }),
      ME,
      NAMES,
      t,
    );
    expect(watered.text).toBe(fill(history.wateredPartner));
    expect(watered.detail).toBe(
      history.speciesFromYou.replace(
        '{{species}}',
        copy.species.STARFLOWER.name,
      ),
    );
  });

  it('lists the flowers of a bouquet in their senders’ colours', () => {
    const line = historyLine(
      entry({
        kind: 'BOUQUET_GIVEN',
        actorId: PARTNER,
        flowers: [
          { species: 'POPPY', senderId: ME },
          { species: 'TULIP', senderId: PARTNER },
        ],
      }),
      ME,
      NAMES,
      t,
    );
    expect(line.text).toBe(fill(history.bouquetPartner));
    expect(line.detail).toBe(
      `${copy.species.POPPY.name} und ${copy.species.TULIP.name}`,
    );
    expect(line.marks.map((mark) => mark.role)).toEqual(['own', 'partner']);
  });

  it('groups entries by day in the order the server sent them', () => {
    const days = historyDays(
      [
        entry({ kind: 'WATERED_TOGETHER', key: 'a' }),
        entry({ kind: 'SHARED_DAY', key: 'b' }),
        entry({
          kind: 'SEED_SENT',
          key: 'c',
          actorId: ME,
          happenedOn: new Date('2026-11-15T00:00:00Z'),
        }),
      ],
      TODAY,
      ME,
      NAMES,
      t,
    );
    expect(days.map((day) => [day.label, day.lines.map((l) => l.key)])).toEqual(
      [
        [history.today, ['a', 'b']],
        [history.yesterday, ['c']],
      ],
    );
  });
});
