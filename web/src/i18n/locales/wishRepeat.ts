/** #1816: repeat a completed wish ("Nochmal erleben") and show its series. */
const wishRepeat = {
  action: 'Nochmal erleben',
  sheet: {
    title: 'Nochmal erleben',
    intro: 'Ein neuer Wunsch, der an das erste Mal erinnert.',
    titleLabel: 'Titel',
    create: 'Wunsch anlegen',
    creating: 'Wird angelegt …',
    planNow: 'Gleich planen',
    planning: 'Wird geplant …',
  },
  series: {
    experienced_one: 'Einmal erlebt',
    experienced_other: '{{count}}× erlebt',
    nthTime: '{{position}}. Mal',
    showAll: 'Alle Male ansehen',
    timesLabel: 'Alle Male',
    timeOn: '{{position}}. Mal · {{date}}',
  },
  reminder: {
    fromWish: 'Aus eurem Wunsch',
    fromWishTitled: 'Aus eurem Wunsch „{{title}}“',
    fromWishTitledNth: 'Aus eurem Wunsch „{{title}}“ · {{position}}. Mal',
  },
};

export default wishRepeat;
