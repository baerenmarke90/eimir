/** #1790 F2: the visible journey of a wish, derived from existing data. */
const wishJourney = {
  stages: {
    wished: 'Gewünscht',
    planned: 'Geplant',
    experienced: 'Erlebt',
    remembered: 'Erinnert',
  },
  pathLabel: 'Weg dieses Wunsches',
  scopePlanned: 'Geplant',
  plannedIntro: 'Diese Wünsche sind schon unterwegs.',
  plannedEmpty: 'Gerade ist kein Wunsch geplant.',
  plannedOn: 'Geplant · {{date}}',
  plannedUndated: 'Geplant · noch ohne Datum',
  remembered: 'Erinnert',
  captureMoment: 'Moment festhalten',
  openPlan: 'Zum Plan',
  openPlanOn: 'Zum Plan · {{date}}',
  planOrigin: 'Euer Wunsch wird wahr',
  fromWish: 'Aus eurem Wunsch',
  hintUnderway_one: 'Ein Wunsch von euch ist gerade unterwegs',
  hintUnderway_other: '{{count}} eurer Wünsche sind gerade unterwegs',
  hintAwaitingMemory_one: 'Ein Wunsch wartet auf eine Erinnerung',
  hintAwaitingMemory_other: '{{count}} Wünsche warten auf eine Erinnerung',
  fulfilledTitle: 'Wunsch erfüllt',
  fulfilledBody: 'Ihr habt euch „{{title}}“ gewünscht – und es gemacht.',
};

export default wishJourney;
