/*
 * Pro Vibe/Energy insights (#1151). Statements stay descriptive: no score, no
 * ranking, no causal or diagnostic wording. "Kein Wert sichtbar" is a single
 * neutral phrase on purpose — it must never distinguish a partner who did not
 * check in from a value the Mutual Reveal rule keeps closed.
 */
const dailyInsights = {
  pro: 'Pro',
  proBrand: 'eimir. Pro',
  nav: {
    label: 'Ansicht wechseln',
    week: 'Woche',
    patterns: 'Muster',
    recap: 'Rückblick',
  },
  loading: 'Euer Verlauf wird geladen …',
  people: {
    you: 'Du',
    partnerFallback: 'Dein Partner',
    ownAvatar: 'Dein Profilbild',
    partnerAvatar: 'Profilbild von {{name}}',
    ownInitials: 'Deine Initialen',
    partnerInitials: 'Initialen von {{name}}',
    ownMarker: 'Kreis',
    partnerMarker: 'Raute',
  },
  gate: {
    title: 'Euer Verlauf in Vibe & Energie',
    body: 'Mit eimir. Pro seht ihr, wie sich Vibe und Energie über Wochen und Monate entwickeln – als ruhiger Rückblick, ohne Bewertung.',
    freeNote:
      'Euer täglicher Vibe- und Energie-Check-in bleibt für euch beide wie gewohnt kostenlos.',
    keptNote: 'Alles, was ihr bereits geteilt habt, bleibt erhalten.',
    back: 'Zurück zu Wir',
  },
  modulesOff: {
    title: 'Vibe und Energie sind gerade ausgeschaltet',
    body: 'Ob Vibe und Energie genutzt werden, bestimmen die Einstellungen eures Space. eimir. Pro ändert daran nichts.',
    settings: 'Zu den Einstellungen',
    vibeOff: 'Vibe ist in eurem Space ausgeschaltet.',
    energyOff: 'Energie ist in eurem Space ausgeschaltet.',
  },
  contextUnavailable: {
    title: 'Euer Verlauf ist gerade nicht verfügbar',
    body: 'Für euren Space ist noch kein gemeinsamer Tageszeitpunkt festgelegt. Sobald das der Fall ist, erscheint hier euer Verlauf.',
  },
  empty: {
    title: 'Hier ist noch nichts zu sehen',
    body: 'Sobald ihr Vibe oder Energie teilt, entsteht an dieser Stelle euer Verlauf.',
  },
  sparse:
    'Bisher gibt es nur wenige Tage. Mit jedem Check-in wird das Bild deutlicher.',
  gapNote:
    'Hier erscheint, was ihr beide sehen dürft. Leere Tage bedeuten: kein Wert sichtbar.',
  noValue: 'kein Wert sichtbar',
  percentage: '{{value}} %',
  chart: {
    detailHint: 'Tippe auf einen Tag, um die Werte zu sehen.',
    dayLabel: '{{date}}: {{summary}}',
    vibeChartLabel: 'Vibe im Wochenverlauf',
    energyChartLabel: 'Energie im Wochenverlauf',
    dayGroup: 'Tage der Woche',
  },
  lanes: {
    GOOD: 'Gut',
    OKAY: 'Okay',
    NEEDS_CONNECTION: 'Nähe',
    NEEDS_SPACE: 'Ruhe',
    STRESSED: 'Anstrengend',
    SAD: 'Nicht so gut',
  },
  bands: {
    veryHigh: 'Sehr viel',
    high: 'Viel',
    mid: 'Okay',
    low: 'Eher wenig',
    veryLow: 'Sehr wenig',
  },
  week: {
    title: 'Eure Woche',
    subtitle: 'Vibe & Energie im Überblick',
    accent: 'Kleine Daten. Große Momente.',
    handwriting: 'Gemeinsame Einblicke. Tiefere Nähe.',
    range: '{{start}} – {{end}}',
    previous: 'Vorherige Woche',
    next: 'Nächste Woche',
    current: 'Diese Woche',
    picker: 'Woche wählen',
    vibeTitle: 'Euer Vibe',
    vibeSubtitle: 'Wie ihr euch gefühlt habt.',
    energyTitle: 'Eure Energie',
    energySubtitle: 'Wie viel Energie ihr hattet.',
    insightsLabel: 'Eure Woche in Kürze',
    closingCta: 'Wochenrückblick ansehen',
    closingHandwriting: 'Ruhige Tage. Stärkere Wir.',
    closingBody: 'Ein ruhiger Blick auf eure Tage – ohne Bewertung.',
  },
  patterns: {
    title: 'Muster entdecken',
    subtitle: 'Was euch im Monat aufgefallen ist.',
    handwriting: 'Tiefere Einblicke. Für noch mehr Wir.',
    monthPicker: 'Monat wählen',
    previous: 'Vorheriger Monat',
    next: 'Nächster Monat',
    glanceTitle: 'Euer Monat auf einen Blick',
    glanceSubtitle: 'Vibe und Energie, Woche für Woche.',
    matrixLabel: 'Euer Monat: Vibe und Energie je Tag',
    matrixDayLabel: '{{date}}: {{summary}}',
    vibeRow: 'Vibe',
    energyRow: 'Energie',
    legendVibe: 'Vibe',
    legendEnergy: 'Energie',
    weekLabel: 'Woche {{number}}',
    calmTitle: 'Gemeinsame Muster',
    calmSubtitle: 'Das haben wir in euren Daten entdeckt.',
    calmNote: 'Kein Richtig oder Falsch. Nur Erkenntnisse für euch.',
    patternsEmpty:
      'Für dieses Muster braucht es noch ein paar mehr Tage. Es wird sichtbar, sobald genug Werte da sind.',
    relationTitle: 'Vibe & Energie im Zusammenhang',
    relationSubtitle: 'Wie viel Energie ihr an Tagen mit welchem Vibe hattet.',
    relationAxis: 'Energie',
    relationVibeAxis: 'Vibe',
    relationLow: 'Sehr wenig',
    relationHigh: 'Sehr viel',
    relationNote:
      'Das beschreibt nur, was am selben Tag zusammen vorkam – nicht, was wovon abhängt.',
    relationEmpty:
      'Sobald an mehr Tagen Vibe und Energie zusammen geteilt sind, zeigt sich hier der Zusammenhang.',
    relationLaneCount_one: '{{count}} Tag',
    relationLaneCount_other: '{{count}} Tage',
    goodTitle: 'Eure guten Tage',
    goodBody: 'An diesen Wochentagen ging es euch beiden besonders oft gut.',
    goodHandwriting: 'Mehr von dem, was euch verbindet.',
    goodEmpty:
      'Sobald sich zeigt, an welchen Tagen es euch beiden oft gut ging, steht das hier.',
  },
  recap: {
    title: 'Wochenrückblick',
    subtitle: 'Ein Blick auf eure Woche.',
    handwriting: 'Gemeinsame Momente zählen.',
    proSubline: 'Noch mehr Einblicke.',
    heroLabel: 'Eure Woche in einem Satz',
    heroHandwriting: 'Kleine Momente. Starkes Wir.',
    noticedTitle: 'Das ist aufgefallen',
    noticedSubtitle: 'Kleine Erkenntnisse aus euren Vibe- und Energie-Daten.',
    noticedHandwriting: 'Kleine Dinge. Große Wirkung.',
    noticedEmpty:
      'Für diese Woche gibt es noch nicht genug gemeinsame Werte für Erkenntnisse.',
    highlightsTitle: 'Eure Highlights',
    highlightsSubtitle: 'Besondere Momente aus eurer Woche.',
    highlightsAll: 'Alle Tage ansehen',
    highlightsEmpty:
      'Diese Woche ist kein besonderer gemeinsamer Tag dabei – auch ein ruhiger Verlauf ist völlig in Ordnung.',
    highlightBothGood: 'Beiden ging es gut',
    highlightBothGoodBody: 'Ihr habt beide einen guten Vibe geteilt.',
    highlightBothEnergy: 'Beide mit viel Energie',
    highlightBothEnergyBody: 'Ihr hattet beide viel Energie.',
    discoverBody: 'Noch mehr aus eurer Reise entdecken.',
    discoverSubline: 'Eure Entwicklung. Eure Muster. Euer Wir.',
    discoverCta: 'Monat ansehen',
    hero: {
      bothGood_one:
        'Diese Woche gab es einen Tag, an dem es euch beiden gut ging.',
      bothGood_other:
        'Diese Woche gab es {{count}} Tage, an denen es euch beiden gut ging.',
      weekendEnergy_higher:
        'Am Wochenende hattet ihr diese Woche besonders viel Energie.',
      sharedDays: 'Diese Woche habt ihr oft beide etwas miteinander geteilt.',
      fallback: 'Diese Woche habt ihr eure Tage festgehalten.',
      empty: 'Für diese Woche gibt es noch keinen Rückblick.',
    },
  },
  insight: {
    bothGood: {
      title_one: 'Am {{weekday}} ging es euch beiden gut.',
      title_other: 'An {{count}} Tagen ging es euch beiden gut.',
      body_one: 'Ihr habt beide einen guten Vibe geteilt.',
      body_other: 'Zuletzt am {{weekday}}.',
    },
    weekendEnergy_higher: {
      title: 'Am Wochenende war eure Energie höher.',
      body: 'Samstag und Sonntag lagen über den Tagen unter der Woche.',
    },
    weekendEnergy_lower: {
      title: 'Am Wochenende war eure Energie etwas niedriger.',
      body: 'Samstag und Sonntag lagen unter den Tagen unter der Woche.',
    },
    vibeEnergy: {
      title: 'An Tagen mit gutem Vibe war oft auch mehr Energie da.',
      body: 'Im Schnitt lag die Energie dann bei {{good}} %, an anderen Tagen bei {{other}} %.',
    },
    sharedDays: {
      title: 'An {{count}} von {{total}} Tagen habt ihr beide etwas geteilt.',
      body: 'Kleine Check-ins, die euch verbinden.',
    },
    energyVersusPrevious_higher: {
      title: 'Eure Energie lag etwas höher als in der Vorwoche.',
      body: 'Verglichen werden die Werte, die ihr beide sehen könnt.',
    },
    energyVersusPrevious_lower: {
      title: 'Eure Energie lag etwas niedriger als in der Vorwoche.',
      body: 'Verglichen werden die Werte, die ihr beide sehen könnt.',
    },
    weekdayEnergy_higher: {
      title: '{{weekday}} war eure Energie oft höher.',
      body: 'An diesen Tagen lag sie im Schnitt über dem Rest des Monats.',
    },
    weekdayEnergy_lower: {
      title: '{{weekday}} war eure Energie oft etwas niedriger.',
      body: 'An diesen Tagen lag sie im Schnitt unter dem Rest des Monats.',
    },
    partnerEnergyVibe_partner: {
      title: 'Wenn {{name}} viel Energie hatte, ging es dir oft auch gut.',
      body: 'Beides kam häufig am selben Tag vor – ohne dass eines das andere erklärt.',
    },
    partnerEnergyVibe_own: {
      title: 'Wenn du viel Energie hattest, ging es {{name}} oft auch gut.',
      body: 'Beides kam häufig am selben Tag vor – ohne dass eines das andere erklärt.',
    },
  },
  weekdayAdverb: {
    0: 'Montags',
    1: 'Dienstags',
    2: 'Mittwochs',
    3: 'Donnerstags',
    4: 'Freitags',
    5: 'Samstags',
    6: 'Sonntags',
  },
  weekdayPlural: {
    0: 'Montage',
    1: 'Dienstage',
    2: 'Mittwoche',
    3: 'Donnerstage',
    4: 'Freitage',
    5: 'Samstage',
    6: 'Sonntage',
  },
} as const;

export default dailyInsights;
