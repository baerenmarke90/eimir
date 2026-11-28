const dailyVibe = {
  loading: 'Eure Gefühle für heute werden geladen …',
  remove: 'Gefühl entfernen',
  contextUnavailable:
    'Der heutige Check-in ist gerade nicht verfügbar. Bitte versuche es später erneut.',
  values: {
    VERY_GOOD: 'Fröhlich',
    GOOD: 'Entspannt',
    OKAY: 'Geht so',
    STRESSED: 'Gestresst',
    SAD: 'Traurig',
    NEEDS_CONNECTION: 'Nähe wäre schön',
    NEEDS_SPACE: 'Etwas Ruhe',
  },
} as const;

export default dailyVibe;
