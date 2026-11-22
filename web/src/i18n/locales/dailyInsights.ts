/*
 * Pro Vibe/Energy insights (#1151). Statements stay descriptive: no score, no
 * ranking, no causal or diagnostic wording. "Kein Wert sichtbar" is a single
 * neutral phrase on purpose — it must never distinguish a partner who did not
 * check in from a value the Mutual Reveal rule keeps closed.
 */
const dailyInsights = {
  title: 'Einblicke',
  pro: 'Pro',
  proBrand: 'eimir. Pro',
  nav: {
    label: 'Ansicht wechseln',
    brief: 'Wochenbrief',
    week: 'Woche',
    patterns: 'Monat',
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
    VERY_GOOD: 'Sehr gut',
    GOOD: 'Entspannt',
    OKAY: 'Geht so',
    NEEDS_CONNECTION: 'Nähe',
    NEEDS_SPACE: 'Ruhe',
    STRESSED: 'Gestresst',
    SAD: 'Traurig',
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
    subtitle: 'Vibe & Energie',
    accent: 'Kleine Daten. Große Momente.',
    handwriting: 'Gemeinsame Einblicke. Tiefere Nähe.',
    range: '{{start}} – {{end}}',
    previous: 'Vorherige Woche',
    next: 'Nächste Woche',
    current: 'Diese Woche',
    picker: 'Woche wählen',
    summary: 'Wochenfazit',
    noHighlights:
      'Für diese Woche gibt es kein gemeinsames Highlight aus den sichtbaren Check-ins.',
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
    subtitle: 'Vibe & Energie im Monatsverlauf.',
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
    subtitle: 'Vibe & Energie im Überblick.',
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
    highlightBothGood: 'Beide mit gutem Vibe',
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
  brief: {
    loading: 'Euer Wochenbrief wird zusammengestellt …',
    coverage: 'An {{count}} von {{total}} Tagen habt ihr beide etwas geteilt.',
    basisToggle: 'Worauf beruht das?',
    basis:
      'Gezählt werden nur Tage, an denen ihr beide eure Werte sehen könnt. Die Aussagen beschreiben, was zusammen vorkam. Sie sagen nichts darüber, was wodurch passiert, und nichts über eure Beziehung als Ganzes.',
    headline: {
      EMPTY: {
        title: 'Diese Woche gibt es noch nichts Gemeinsames zu sehen.',
        body: 'Sobald ihr beide Vibe oder Energie teilt, entsteht hier euer Wochenbrief.',
      },
      SPARSE: {
        title: 'Für Muster war diese Woche zu wenig geteilt.',
        body: 'Mit jedem Tag, an dem ihr beide etwas teilt, wird das Bild deutlicher.',
      },
      SHARED_GOOD_DAYS: {
        title:
          'Eure guten Tage hatten etwas gemeinsam: Ihr hattet etwas zusammen vor.',
        body: '{{days}} ging es euch beiden gut. An diesen Tagen gab es einen gemeinsamen Plan oder Moment.',
      },
      GOOD_DAYS: {
        title_one: 'An einem Tag ging es euch beiden gut.',
        title_other: 'An {{count}} Tagen ging es euch beiden gut.',
        body: 'Das war {{days}}.',
      },
      STEADY: {
        title: 'Eine gleichmäßige Woche.',
        body: 'Kein Tag stach heraus. Auch ruhige Wochen gehören dazu.',
      },
    },
    good: {
      title: 'Was euch gutgetan hat',
      momentDate: '{{date}}',
      momentPhotos_one: '{{date}} · ein Foto',
      momentPhotos_other: '{{date}} · {{count}} Fotos',
      momentUntitled: 'Euer Moment',
      stripLabel: 'Eure Woche, Tag für Tag',
      stripHint: 'Tippe auf einen Tag, um eure Werte zu sehen.',
      legendShared: 'Plan oder Moment',
      dayGood: 'Euch beiden ging es gut.',
      dayShared: 'Ihr hattet einen gemeinsamen Plan oder Moment.',
    },
    attention: {
      title: 'Was gerade Aufmerksamkeit braucht',
      OWN_CLOSENESS:
        'An {{count}} Tagen hast du dir Nähe gewünscht, während {{name}} eher Ruhe wollte.',
      PARTNER_CLOSENESS:
        'An {{count}} Tagen wünschte sich {{name}} Nähe, während du eher Ruhe wolltest.',
      MIXED:
        'An {{count}} Tagen wünschte sich einer von euch Nähe und der andere eher Ruhe.',
      body: 'Das kommt in jeder Beziehung vor. Wenn ihr kurz darüber sprecht, wisst ihr beim nächsten Mal besser, was der andere braucht.',
      prompt:
        'Sprecht kurz darüber: Was hilft dir, wenn du Ruhe brauchst, und was hilft mir, wenn ich Nähe brauche?',
    },
    impulse: {
      title: 'Euer Impuls für nächste Woche',
      sourceOwn: 'Dein Wunsch · seit {{date}} auf eurer Liste',
      sourcePartner: 'Wunsch von {{name}} · seit {{date}} auf eurer Liste',
      rhythm:
        '{{weekday}} hattet ihr in den letzten Wochen oft beide viel Energie. Wie wäre es mit {{date}}?',
      plan: 'Als Plan anlegen',
      next: 'Andere Idee',
      emptyTitle: 'Kein offener Wunsch auf eurer Liste',
      emptyBody:
        'Haltet einen Wunsch fest, dann schlägt euch der Wochenbrief hier einen nächsten Plan vor.',
      addWish: 'Wunsch festhalten',
    },
    followUp: {
      title: 'Aus der letzten Woche',
      body: 'Ihr hattet „{{title}}“ für {{date}} geplant. Hat es geklappt? Im Plan könnt ihr ihn abschließen und einen Moment festhalten.',
      bodyUntitled:
        'Ihr hattet einen Plan für {{date}}. Hat es geklappt? Im Plan könnt ihr ihn abschließen und einen Moment festhalten.',
      open: 'Plan ansehen',
    },
    newPatterns: {
      title: 'Neu entdeckt',
    },
    history: 'Verlauf über Wochen und Monate',
    scope: {
      label: 'Wochenbrief für',
      shared: 'Gemeinsam',
      own: 'Nur ich',
    },
    personal: {
      loading: 'Dein Wochenbrief wird zusammengestellt …',
      privateLabel: 'Nur für dich sichtbar',
      headline: {
        EMPTY: {
          title: 'Diese Woche hast du noch nichts geteilt.',
          body: 'Sobald du Vibe oder Energie teilst, entsteht hier dein persönlicher Wochenbrief.',
        },
        SPARSE: {
          title: 'Für Muster war diese Woche zu wenig dabei.',
          body: 'An {{count}} von {{total}} Tagen hast du etwas geteilt.',
        },
        WEEKDAY_LOWER: {
          title: '{{weekdays}} kosten dich oft Energie.',
          body: 'An {{count}} von {{total}} Tagen hast du diese Woche etwas geteilt.',
        },
        SHARED_HIGHER: {
          title: 'Gemeinsame Pläne und Momente tun dir gut.',
          body: 'An {{count}} von {{total}} Tagen hast du diese Woche etwas geteilt.',
        },
        GOOD_DAYS: {
          title_one: 'An einem Tag ging es dir gut.',
          title_other: 'An {{count}} Tagen ging es dir gut.',
          body: 'An {{count}} von {{total}} Tagen hast du diese Woche etwas geteilt.',
        },
        STEADY: {
          title: 'Eine gleichmäßige Woche für dich.',
          body: 'An {{count}} von {{total}} Tagen hast du diese Woche etwas geteilt.',
        },
      },
      goodTitle: 'Was dir guttut',
      sharedHigher:
        'An Tagen mit einem gemeinsamen Plan oder Moment hattest du mehr Energie.',
      sharedLower:
        'An Tagen mit einem gemeinsamen Plan oder Moment hattest du weniger Energie.',
      withShared: 'Mit Plan oder Moment',
      otherDays: 'Andere Tage',
      barsLabel:
        'Deine Energie im Schnitt: {{group}} % an Tagen mit Plan oder Moment, {{others}} % an anderen Tagen.',
      basis_one:
        'Grundlage: ein Tag mit deiner Energie in den letzten acht Wochen.',
      basis_other:
        'Grundlage: {{count}} Tage mit deiner Energie in den letzten acht Wochen.',
      rhythmTitle: 'Dein Wochenrhythmus',
      lowerWeekday:
        '{{weekday}} lag deine Energie meist niedriger: im Schnitt {{energy}} % statt {{others}} %.',
      higherWeekday:
        '{{weekday}} lag deine Energie meist höher: im Schnitt {{energy}} % statt {{others}} %.',
      weekTitle: 'Deine Woche',
      dayGood: 'Dir ging es gut.',
      stripHint: 'Tippe auf einen Tag, um deine Werte zu sehen.',
    },
    wirHint: {
      text: 'Euer Wochenbrief für letzte Woche ist da.',
      open: 'Wochenbrief ansehen',
      later: 'Später',
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
