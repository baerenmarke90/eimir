const weeklyInsights = {
  eyebrow: 'Ein Moment zum Verstehen',
  title: 'Was euch gerade verbindet',
  intro:
    'Entdeckt Muster aus bis zu acht Wochen und kleine Anregungen für euren Alltag. Ihr entscheidet, was zu euch passt.',
  generate: 'Einblicke entdecken',
  regenerate: 'Einblicke neu ansehen',
  loading: 'Eure sichtbaren Angaben werden geprüft …',
  error:
    'Das hat gerade nicht geklappt. Prüfe deine Verbindung und versuche es noch einmal. Deine letzte bestätigte Rückmeldung bleibt gespeichert.',
  changed:
    'Eure Angaben oder Freigaben haben sich geändert. Bitte erstellt die Einblicke neu.',
  ai: 'Mit KI aus euren Angaben ausgewählt',
  rules: 'Aus euren Angaben zusammengestellt',
  general: 'Allgemeine Anregungen',
  range: 'Betrachteter Zeitraum: {{start}} bis {{end}}',
  sparse:
    'Es gibt noch zu wenige gemeinsam sichtbare Angaben für persönliche Muster. Diese Anregungen sind allgemein gehalten.',
  limits:
    'Das beschreibt nur die erfassten Tage. Datenlücken bleiben offen; Ursachen oder die Qualität eurer Beziehung lassen sich daraus nicht ableiten.',
  samples_one: 'Grundlage: ein gemeinsam sichtbarer Tag',
  samples_other: 'Grundlage: {{count}} gemeinsam sichtbare Tage',
  facts: {
    JOINT_DAYS:
      'In der gewählten Woche habt ihr an {{value}} Tagen beide Vibe oder Energie geteilt.',
    ENERGY_RISING:
      'An den erfassten Tagen lag eure Energie bei euch beiden im Mittel höher als in der Vorwoche.',
    ENERGY_FALLING:
      'An den erfassten Tagen lag eure Energie bei euch beiden im Mittel niedriger als in der Vorwoche.',
    WEEKEND_HIGHER:
      'Über mehrere Wochen lag eure Energie an erfassten Wochenendtagen bei euch beiden im Mittel höher als unter der Woche.',
    WEEKEND_LOWER:
      'Über mehrere Wochen lag eure Energie an erfassten Wochenendtagen bei euch beiden im Mittel niedriger als unter der Woche.',
    WEEKDAY_LOWER:
      'An erfassten Tagen am {{weekday}} lag eure Energie bei euch beiden im Mittel niedriger als an anderen Wochentagen.',
    DIFFERENT_VIBES:
      'Über mehrere Wochen habt ihr an {{value}} der gemeinsam erfassten Tage unterschiedliche Vibes angegeben.',
  },
  recommendationsTitle: 'Ein kleiner Impuls für euch',
  optional:
    'Allgemeine Ideen zum Ausprobieren – wählt gemeinsam, was sich für euch gut anfühlt.',
  recommendations: {
    quiet_time: {
      title: 'Zeit ohne Programm',
      body: 'Wie wäre es mit einem ruhigen Abend ohne feste Pläne? Fragt euch vorher, ob ihr Nähe oder lieber etwas Zeit für euch möchtet.',
    },
    small_plan: {
      title: 'Etwas Kleines vorhaben',
      body: 'Sucht euch eine kleine gemeinsame Aktivität aus, auf die ihr beide Lust habt. Ein Spaziergang oder zusammen kochen kann schon reichen.',
    },
    appreciation: {
      title: 'Etwas Schönes aussprechen',
      body: 'Nennt einander eine konkrete Kleinigkeit, die ihr diese Woche geschätzt habt. Es muss nichts Großes sein.',
    },
    listening: {
      title: 'Einfach zuhören',
      body: 'Nehmt euch ein paar ungestörte Minuten: Was beschäftigt dich gerade? Fragt nach, ob Zuhören oder gemeinsames Nachdenken gewünscht ist.',
    },
    own_pace: {
      title: 'Euren Rhythmus finden',
      body: 'Fragt einander: Was würde dir gerade guttun – gemeinsame Zeit, Ruhe oder etwas für dich? Unterschiedliche Wünsche dürfen nebeneinander stehen.',
    },
    keep_ritual: {
      title: 'Ein kleines Ritual behalten',
      body: 'Gibt es einen Moment, der euch beiden guttut? Überlegt, ob ihr ihm in der nächsten Woche wieder etwas Platz geben möchtet.',
    },
  },
  feedbackFor: 'Deine Rückmeldung zu „{{title}}“',
  ratings: {
    HELPFUL: 'Für mich hilfreich',
    NOT_FITTING: 'Passt für mich nicht',
  },
  feedbackPrivacy:
    'Deine Rückmeldung ist nur für dich sichtbar und beeinflusst deine nächsten Vorschläge. Sie ist keine gemeinsame Bewertung.',
  manageFeedback: 'Deine Rückmeldungen verwalten',
  clear: 'Rückmeldung entfernen',
  clearAll: 'Meine Impuls-Rückmeldungen löschen',
  cleared: 'Deine Impuls-Rückmeldungen sind gelöscht.',
  clearError:
    'Die Rückmeldungen konnten nicht vollständig gelöscht werden. Bitte versuche es erneut.',
  allExcluded:
    'Du hast alle Anregungen ausgeblendet. Du kannst deine Rückmeldungen unten entfernen und neue Einblicke ansehen.',
};
export default weeklyInsights;
