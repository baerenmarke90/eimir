const proPaywall = {
  eyebrow: 'eimir. Pro',
  contexts: {
    dateIdeas: {
      title: 'Euer nächster schöner Moment beginnt hier.',
      description:
        'Kuratierte Date-Ideen, die zu eurer Zeit, eurem Budget und eurer Stimmung passen.',
      benefits: {
        first: {
          title: '200 kuratierte Ideen',
          body: 'Für zu Hause und unterwegs – kleine Abende und besondere Momente.',
        },
        second: {
          title: 'Filter, die zu euch passen',
          body: 'Nach Kategorie, Dauer, Budget und Ort kombinierbar.',
        },
        third: {
          title: 'Direkt in eure Planung',
          body: 'Merkt euch eine Idee als Wunsch oder macht gleich einen Plan daraus.',
        },
      },
    },
    recaps: {
      title: 'Entdeckt eure gemeinsame Geschichte neu.',
      description:
        'Rückblicke, die eure Momente zu einer Geschichte zusammenführen.',
      benefits: {
        first: {
          title: 'Monats- und Jahresrückblicke',
          body: 'Jeder Abschnitt eurer Zeit als eigene, ruhige Ausgabe.',
        },
        second: {
          title: 'Eure eigenen Worte',
          body: 'Ergänzt Gedanken zu einem Rückblick – fertige Ausgaben bleiben lesbar.',
        },
        third: {
          title: 'Vertiefende Einblicke',
          body: 'Wochenrückblicke und behutsame Muster eurer gemeinsamen Tage.',
        },
      },
    },
    memoryMap: {
      title: 'Eure Geschichte hat viele Orte.',
      description:
        'Seht auf einer Karte, wo eure gemeinsamen Momente passiert sind.',
      benefits: {
        first: {
          title: 'Alle Orte auf einer Karte',
          body: 'Erinnerungen mit Ort erscheinen auf eurer gemeinsamen Karte.',
        },
        second: {
          title: 'Vom Ort zum Moment',
          body: 'Tippt auf einen Ort und öffnet direkt eure Erinnerungen dort.',
        },
        third: {
          title: 'Rückblicke dazu',
          body: 'Entdeckt eure Geschichte auch in Monats- und Jahresrückblicken.',
        },
      },
    },
    photoSources: {
      title: 'Eure Erinnerungen. Noch einfacher zusammen.',
      description: 'Übernehmt ausgewählte Fotos direkt aus euren Fotodiensten.',
      benefits: {
        first: {
          title: 'Immich verbinden',
          body: 'Wählt Fotos aus eurem eigenen Immich für eure Erinnerungen aus.',
        },
        second: {
          title: 'Google Fotos',
          body: 'Übernehmt ausgewählte Fotos aus Google Fotos, wenn euer eimir. es anbietet.',
        },
        third: {
          title: 'Kurze Videos',
          body: 'Haltet Momente auch als kurzes Video fest, wo euer eimir. es unterstützt.',
        },
      },
    },
    calendar: {
      title: 'Gemeinsam planen. Automatisch synchronisieren.',
      description:
        'Eure Pläne erscheinen in dem Kalender, den ihr schon teilt – ohne sie abzutippen.',
      benefits: {
        first: {
          title: 'Euer gemeinsamer Kalender',
          body: 'Neue und geänderte Pläne landen einmal in dem Kalender, den ihr beide nutzt.',
        },
        second: {
          title: 'CalDAV oder Google',
          body: 'Verbindet einen kompatiblen CalDAV-Kalender oder Google Kalender.',
        },
        third: {
          title: 'Sicher abgestimmt',
          body: 'Änderungen im Kalender werden nie ungefragt überschrieben.',
        },
      },
    },
    games: {
      title: 'Mehr besondere Momente miteinander.',
      description:
        'Spielerische Erlebnisse für euch beide – ohne Punkte und ohne Druck.',
      benefits: {
        first: {
          title: 'Gemeinsam spielen',
          body: 'Kleine Spiele, die euch einander noch näherbringen.',
        },
        second: {
          title: 'Glücksmomente',
          body: 'Haltet zusammen fest, was euch gerade glücklich macht.',
        },
        third: {
          title: 'Zeitreise',
          body: 'Schickt euch eine kleine Reise in eure gemeinsamen Erinnerungen.',
        },
      },
    },
    general: {
      title: 'Mehr Möglichkeiten für eure gemeinsame Geschichte.',
      description:
        'eimir. Pro ergänzt euer gemeinsames Zuhause um Ideen, Rückblicke und besondere Erlebnisse.',
      benefits: {
        first: {
          title: 'Date-Ideen',
          body: '200 kuratierte Ideen für eure gemeinsame Zeit.',
        },
        second: {
          title: 'Rückblicke und Erinnerungskarte',
          body: 'Entdeckt eure Geschichte über die Zeit und an ihren Orten.',
        },
        third: {
          title: 'Spiele und persönliche Extras',
          body: 'Gemeinsame Erlebnisse, der Spruch des Tages und eigene Gestaltung.',
        },
      },
    },
  },
  benefitsLabel: 'Was Pro euch bietet',
  plansLegend: 'Euer Tarif',
  plans: {
    yearly: {
      name: 'Jährlich',
      price: '{{price}} pro Jahr',
      perMonth: 'entspricht {{price}} im Monat',
      saving: 'Spart rund {{percent}} %',
    },
    monthly: {
      name: 'Monatlich',
      price: '{{price}} pro Monat',
    },
  },
  forBoth: 'Ein Abo. Für euch beide.',
  forBothBody:
    'Ein Pro-Abo gilt für euren gemeinsamen Bereich, ganz gleich, wer von euch es abschließt.',
  free: 'eimir. Free bleibt dauerhaft kostenlos.',
  purchase: {
    yearly: 'Pro jährlich abonnieren',
    monthly: 'Pro monatlich abonnieren',
  },
  purchasing: 'Kauf wird gestartet …',
  restore: 'Kauf wiederherstellen',
  unavailableTitle: 'Kauf hier noch nicht möglich',
  unavailableBody:
    'Pro kann in eimir. noch nicht gekauft werden. Sobald es möglich ist, findet ihr den Kauf genau an dieser Stelle.',
  active: {
    title: 'eimir. Pro ist für euch aktiv.',
    body: 'Alle Pro-Funktionen stehen euch beiden zur Verfügung.',
    continue: 'Weiter',
  },
  statusUnknown:
    'Euer Pro-Status konnte gerade nicht geprüft werden. Eure Inhalte sind davon nicht betroffen.',
  statusRetry: 'Erneut prüfen',
  termsTitle: 'Gut zu wissen',
  terms: {
    renewal: {
      title: 'Verlängerung',
      body: 'Das Abo verlängert sich automatisch um den gewählten Zeitraum, bis es gekündigt wird.',
    },
    cancellation: {
      title: 'Kündigung',
      body: 'Ihr könnt jederzeit zum Ende des laufenden Zeitraums kündigen. Eure Erinnerungen, Wünsche und Pläne bleiben vollständig erhalten.',
    },
    privacy: {
      title: 'Datenschutz',
      body: 'Der Zahlungsanbieter erhält keine Inhalte aus eurer Beziehung.',
      link: 'Datenschutzerklärung',
    },
  },
  outcomes: {
    confirmed: 'Willkommen bei eimir. Pro! Es geht direkt weiter.',
    cancelled: 'Kauf abgebrochen. Es wurde nichts berechnet.',
    pending:
      'Eure Zahlung wird noch bestätigt. Pro wird freigeschaltet, sobald sie abgeschlossen ist.',
    failed: 'Die Zahlung ist fehlgeschlagen. Es wurde nichts freigeschaltet.',
    network: 'Keine Verbindung. Bitte versucht es gleich noch einmal.',
    restored: 'Euer Kauf wurde wiederhergestellt.',
    partnerActive: 'Pro ist bereits für euren gemeinsamen Bereich aktiv.',
    expired:
      'Euer Pro-Zugang ist abgelaufen. Eure Inhalte bleiben vollständig erhalten.',
  },
  settingsAction: 'Tarife ansehen',
  contextAction: 'Mit eimir. Pro entdecken',
};

export default proPaywall;
