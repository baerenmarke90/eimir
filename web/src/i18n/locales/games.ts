const games = {
  eyebrow: 'Spielen',
  title: 'Gemeinsam spielen',
  intro: 'Erinnerungen erraten und Neues übereinander erfahren.',
  status: {
    premium: 'Pro',
    comingSoon: 'Bald verfügbar',
    playNow: 'Spielen',
  },
  local: {
    coupleRequiredTitle: 'Ein Spiel für euch beide',
    coupleRequiredBody:
      'Verbindet zuerst eure beiden Profile in einem gemeinsamen Bereich.',
    back: 'Zurück zu Spielen',
    progress: 'Impuls {{current}} von {{total}}',
    finished: 'Für heute gespielt',
    finishTitle: 'Ein bisschen Zeit für euch.',
    finishBody_one:
      'Ihr habt euch auf {{count}} Impuls eingelassen. Der Rest darf warten.',
    finishBody_other:
      'Ihr habt euch auf {{count}} Impulse eingelassen. Der Rest darf warten.',
    restart: 'Neue Runde',
    done: 'Haben wir gemacht',
    next: 'Nächster Impuls',
    skip: 'Überspringen',
    privacy:
      'Eure Antworten bleiben im Gespräch. Hier wird nichts aufgezeichnet oder gespeichert.',
    happiness: {
      instruction:
        'Sucht euch aus, was gerade zu euch passt. Ihr könnt jeden Impuls auslassen.',
      first:
        'Sagt euch eine kleine Sache, die ihr heute am anderen geschätzt habt.',
      second:
        'Sucht zusammen ein Lied aus und hört es ohne nebenbei aufs Handy zu schauen.',
      third:
        'Macht eine kleine Pause zusammen. Ein Glas Wasser, ein Tee oder einfach kurz durchatmen.',
      fourth:
        'Zeigt euch einen Gegenstand, mit dem ihr eine schöne gemeinsame Erinnerung verbindet.',
      fifth: 'Erzählt euch etwas, das euch zuletzt zum Lachen gebracht hat.',
      sixth:
        'Überlegt euch eine kleine Sache, auf die ihr euch morgen gemeinsam freuen könnt.',
    },
    timeTravel: {
      instruction:
        'Erzählt abwechselnd. Es gibt keine richtigen Antworten und keinen Punktestand.',
      first:
        'Was ist euch von eurem ersten gemeinsamen Ausflug im Gedächtnis geblieben?',
      second:
        'Denkt an einen gewöhnlichen Tag zusammen. Welches kleine Detail würdet ihr gern behalten?',
      third:
        'An welchem Ort würdet ihr einen gemeinsamen Moment gern noch einmal erleben?',
      fourth:
        'Welche gemeinsame Panne könnt ihr heute mit etwas Abstand erzählen?',
      fifth: 'Welche kleine Gewohnheit ist mit der Zeit zu eurer geworden?',
      sixth:
        'Welche Erinnerung würdet ihr dem anderen gern aus eurer eigenen Sicht erzählen?',
    },
  },
  entries: {
    moments: {
      role: 'Erkennen',
      title: 'Unsere Momente',
      description: 'Findet eure gemeinsamen Erinnerungen wieder.',
    },
    wishes: {
      role: 'Kennen',
      title: 'Wunschdetektiv',
      description: 'Wie gut kennt ihr die Wünsche des anderen?',
    },
    perspective: {
      role: 'Entdecken',
      title: 'Wer von euch?',
      description: 'Vergleicht spielerisch eure Sicht auf euch beide.',
    },
    happiness: {
      role: 'Tun',
      title: 'Glücksmomente',
      description: 'Eine kleine gemeinsame Mission für euren Tag.',
    },
    timeTravel: {
      role: 'Vertiefen',
      title: 'Zeitreise',
      description: 'Taucht tiefer in eure gemeinsame Geschichte ein.',
    },
  },
  momentsGame: {
    back: 'Zurück zu Spielen',
    intro:
      'Dreht abwechselnd Karten um und findet die Fotos wieder, die zu euren gemeinsamen Erinnerungen gehören.',
    loadingTitle: 'Eure Momente werden gemischt',
    loadingBody: 'Wir laden nur Erinnerungen, die ihr beide sehen dürft.',
    coupleRequiredTitle: 'Dieses Spiel gehört euch beiden',
    coupleRequiredBody:
      'Unsere Momente ist für einen gemeinsamen Bereich mit genau zwei Partnern gedacht.',
    sparseEyebrow: 'Noch ein bisschen Geschichte sammeln',
    sparseTitle: 'Für eine Runde fehlen noch gemeinsame Fotomomente.',
    sparseBody:
      'Sobald ihr mindestens drei gemeinsame Erinnerungen mit Foto festgehalten habt, kann eure erste Runde starten. Private Inhalte werden dafür niemals verwendet.',
    sparseAction: 'Zu euren Momenten',
    turnLabel: 'Am Zug',
    turnValue: '{{name}} ist dran',
    scoreAria: 'Gefundene Paare',
    boardAria: 'Memory-Spielfeld mit euren gemeinsamen Momenten',
    cardHidden: 'Karte {{index}} von {{total}}, verdeckt',
    cardPhotoRevealed: 'Foto zu {{title}}, aufgedeckt',
    cardContextRevealed: 'Erinnerung {{title}}, {{date}}, aufgedeckt',
    cardMatched: 'Gefundenes Paar: {{title}}, {{date}}',
    matchEyebrow: 'Wiedergefunden',
    continue: 'Weiter',
    finishEyebrow: 'Eure Runde',
    finishTitle: 'Ihr habt alle Momente wiedergefunden.',
    finishBody: '{{count}} kleine Geschichten aus eurem gemeinsamen Leben.',
    restart: 'Noch einmal',
    backToGames: 'Andere Spiele ansehen',
  },
  wishDetective: {
    back: 'Zurück zu Spielen',
    intro:
      'Gebt euch drei Hinweise, reicht das Gerät weiter und findet heraus, wie gut ihr die Wünsche des anderen kennt.',
    loadingTitle: 'Eure Wünsche werden vorbereitet',
    loadingBody: 'Wir laden nur offene Wünsche aus eurem gemeinsamen Bereich.',
    coupleRequiredTitle: 'Dieses Spiel gehört euch beiden',
    coupleRequiredBody:
      'Wunschdetektiv ist für einen gemeinsamen Bereich mit genau zwei Partnern gedacht.',
    sparseEyebrow: 'Noch ein paar Wünsche sammeln',
    sparseTitle: 'Für eine faire Runde fehlen noch gemeinsame Wünsche.',
    sparseBody:
      'Sobald ihr beide mindestens zwei offene Wünsche festgehalten habt, kann eure erste Runde starten. Private Geschenkideen werden dafür niemals verwendet.',
    sparseAction: 'Wünsche ergänzen',
    interruptedEyebrow: 'Runde unterbrochen',
    interruptedTitle: 'Der Wunsch bleibt verborgen.',
    interruptedBody:
      'Ihr habt die Runde während der Übergabe oder beim Raten verlassen. Gebt das Gerät zurück und startet von „Gemeinsam spielen“ eine neue Runde.',
    round: 'Runde {{current}} von {{total}}',
    clueEyebrow: '{{name}}, dein Wunsch',
    cluePrivate: 'Nicht zeigen – dein Partner rät gleich.',
    cluesLegend: 'Drei Hinweise',
    cluesHelp: 'Je ein Wort. Der Wunsch selbst darf nicht im Hinweis stecken.',
    clueLabel: 'Hinweis {{index}}',
    startHandoff: 'Gerät weitergeben',
    handoffEyebrow: 'Kurz wechseln',
    handoffTitle: 'Gerät an {{name}} reichen',
    handoffBody: 'Der Wunsch ist jetzt verborgen.',
    handoffConfirm: '{{name}}: Ich habe es',
    guessEyebrow: '{{name}}, du bist dran',
    guessTitle: 'Die Hinweise',
    cluesAria: 'Drei Hinweise',
    guessLabel: 'Welchen Wunsch meint {{name}}?',
    submitGuess: 'Raten',
    pass: 'Passen',
    revealEyebrow: 'Auflösung',
    correctTitle: '{{name}} kennt deinen Wunsch.',
    incorrectTitle: 'Knapp daneben.',
    passedTitle: 'Gepasst.',
    continue: 'Weiter',
    finishEyebrow: 'Eure Runde',
    finishTitle: 'Das war eure Wunschdetektiv-Runde.',
    finishBody: '{{correct}} von {{total}} Wünschen erkannt.',
    restart: 'Noch einmal',
    backToGames: 'Andere Spiele ansehen',
    errors: {
      required: 'Trag einen Hinweis ein.',
      oneWord: 'Bitte genau ein Wort verwenden.',
      tooLong: 'Der Hinweis ist zu lang.',
      duplicate: 'Nimm für jeden Hinweis ein anderes Wort.',
      wishWord:
        'Dieses Wort steckt bereits im Wunsch. Nimm einen anderen Hinweis.',
    },
  },
  whoOfUs: {
    back: 'Zurück zu Spielen',
    intro:
      'Beantwortet dieselbe Frage nacheinander und entdeckt, wo ihr euch gleich oder unterschiedlich seht.',
    loadingTitle: 'Eure Runde wird vorbereitet',
    loadingBody: 'Wir laden nur eure beiden Namen für diese gemeinsame Runde.',
    coupleRequiredTitle: 'Dieses Spiel gehört euch beiden',
    coupleRequiredBody:
      'Wer von euch? ist für einen gemeinsamen Bereich mit genau zwei Partnern gedacht.',
    round: 'Frage {{current}} von {{total}}',
    agreementCount: '{{count}}× gleich gedacht',
    firstResponder: '{{name}}, du zuerst',
    secondResponder: '{{name}}, jetzt du',
    choosePrompt: 'Wer von euch passt eher dazu?',
    choicesAria: 'Wählt eine Person',
    choiceAria: '{{responder}} wählt {{choice}}',
    handoffEyebrow: 'Nicht verraten',
    handoffTitle: 'Gerät an {{name}} reichen',
    handoffBody: 'Die erste Antwort ist jetzt verborgen.',
    handoffConfirm: '{{name}}: Ich habe es',
    revealEyebrow: 'Eure Sicht',
    sameTitle: 'Ihr seid euch einig.',
    sameBody: 'Ihr sagt beide: {{name}}.',
    differentTitle: 'Da seht ihr euch unterschiedlich.',
    differentBody: 'Vielleicht ist genau das die spannende Antwort.',
    continue: 'Nächste Frage',
    finishEyebrow: 'Eure Runde',
    finishTitle: 'So habt ihr euch heute gesehen.',
    finishAgreement: '{{count}} von {{total}} Mal gleich gedacht.',
    finishDifferent:
      'Bei {{count}} Fragen habt ihr euch unterschiedlich gesehen.',
    restart: 'Noch einmal',
    backToGames: 'Andere Spiele ansehen',
    questions: {
      morningLonger: 'Wer von euch braucht morgens länger?',
      movieSleeper: 'Wer schläft beim Film eher ein?',
      spontaneous: 'Wer entscheidet spontaner?',
      travelPlanner: 'Wer plant Reisen genauer?',
      sameFood: 'Wer bestellt häufiger dasselbe Essen?',
      wrongLyrics: 'Wer singt häufiger falsche Liedtexte mit?',
      snack: 'Wer würde eher noch einen Snack holen?',
      packing: 'Wer braucht beim Packen mehr Platz?',
    },
  },
};

export default games;
