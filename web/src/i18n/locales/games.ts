const games = {
  eyebrow: 'Spielen',
  title: 'Gemeinsam spielen',
  intro: 'Erinnerungen erraten und Neues übereinander erfahren.',
  status: {
    premium: 'Pro',
    comingSoon: 'Bald verfügbar',
    playNow: 'Spielen',
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
    paarMinutes: {
      role: 'Loslegen',
      title: 'Paar Minuten',
      description: 'Vier kurze Spiele für zwei. Ein Handy reicht.',
    },
  },
  paarMinutes: {
    back: 'Zurück zu Spielen',
    duration: '{{minutes}} Min.',
    next: 'Nächste Runde',
    reveal: 'Auflösen',
    answer: 'Lösung',
    formats: {
      film: {
        title: 'Schlechte Filmbeschreibung',
        rules:
          'Ratet gemeinsam, welcher Film gemeint ist. Wenn ihr euch entschieden habt, deckt den Titel auf.',
      },
      story: {
        title: 'Wie ging das aus?',
        rules:
          'Erzähl eine wahre Geschichte von früher bis kurz vor die Auflösung. Die andere Person tippt, wie sie ausging. Dann erzählst du den echten Schluss.',
      },
      match: {
        title: 'Gleicher Gedanke',
        rules:
          'Sagt auf drei gleichzeitig je ein Wort. Sind die Wörter verschieden, sucht beide ein neues Wort, das eure letzten Antworten verbindet. Dafür habt ihr zwei Versuche.',
      },
      choice: {
        title: 'Dein Tipp',
        rules:
          'Eine Person wählt im Kopf. Die andere versucht, die Wahl zu erraten. Dann nennt ihr auf drei gleichzeitig eure Antworten. Bei der nächsten Tipprunde tauscht ihr.',
      },
    },
    rounds: {
      homeAlone: {
        prompt:
          'Ein Achtjähriger übernimmt die Haussicherheit, weil seine Familie ohne ihn verreist.',
        answer: 'Kevin – Allein zu Haus',
      },
      ratatouille: {
        prompt:
          'Ein Pariser Spitzenrestaurant hängt von einem Koch ab, der sich vor dem Gesundheitsamt in einer Kochmütze verstecken müsste.',
        answer: 'Ratatouille',
      },
      findingNemo: {
        prompt:
          'Ein Vater sucht seinen Sohn im halben Ozean. Die einzige Mitreisende, die den Weg weiß, vergisst immer wieder, warum sie unterwegs sind.',
        answer: 'Findet Nemo',
      },
      groundhogDay: {
        prompt:
          'Ein schlecht gelaunter Wettermoderator meldet jeden Morgen dasselbe Wetter. Das liegt daran, dass es jedes Mal derselbe Morgen ist.',
        answer: 'Und täglich grüßt das Murmeltier',
      },
      jurassicPark: {
        prompt:
          'Ein Freizeitpark hat einen Stromausfall. Ausgerechnet die Attraktionen verlassen als Erste ihre Gehege.',
        answer: 'Jurassic Park',
      },
      backToTheFuture: {
        prompt:
          'Ein Teenager muss dafür sorgen, dass seine Mutter mit seinem Vater zum Schulball geht. Sie würde aber lieber mit ihm hin.',
        answer: 'Zurück in die Zukunft',
      },
      wrongPlace: {
        prompt:
          'Einmal, als dir viel zu spät aufgefallen ist, dass du im falschen Zug, Raum oder auf der falschen Feier warst.',
      },
      dinnerSave: {
        prompt:
          'Ein Gericht, das kurz vor dem Servieren plötzlich einen Plan B brauchte.',
      },
      oddPurchase: {
        prompt:
          'Ein Kauf, der sich zu Hause als etwas ganz anderes herausstellte.',
      },
      surpriseInvite: {
        prompt:
          'Eine spontane Einladung, aus der ein ganz anderer Abend wurde.',
      },
      familyHabit: {
        prompt:
          'Etwas, das bei euch zu Hause für dich völlig normal war, bis du bei Freunden zu Besuch warst.',
      },
      misheardSong: {
        prompt: 'Ein Lied, dessen Refrain du jahrelang falsch verstanden hast.',
      },
      hotelNight: {
        prompt: 'Welcher Gegenstand rettet jede noch so schlechte Hotelnacht?',
      },
      summer: {
        prompt: 'Was riecht für euch sofort nach Sommer?',
      },
      sundaySound: {
        prompt: 'Welches Geräusch passt zu einem richtig guten Sonntagmorgen?',
      },
      trainSnack: {
        prompt: 'Welcher Snack gehört zu einer langen Zugfahrt?',
      },
      sleptThrough: {
        prompt:
          'Ein Wort für den Moment, in dem ihr beide merkt, dass ihr vor dem Film eingeschlafen seid.',
      },
      strangeKitchen: {
        prompt: 'Was würdet ihr in einer fremden Küche als Erstes suchen?',
      },
      hotelRoom: {
        prompt:
          'Hotelzimmer mit Meerblick und Baustelle ab sieben oder Zimmer zum Innenhof mit Frühstück bis zwölf?',
      },
      concert: {
        prompt:
          'Deine Lieblingsband in der letzten Reihe im Trockenen sehen oder bei Regen ganz vorne stehen?',
      },
      sleepIn: {
        prompt:
          'Im Urlaub richtig ausschlafen oder früh raus und die Stadt eine Stunde fast für dich allein haben?',
      },
      bistro: {
        prompt:
          'Am ersten Abend in einer fremden Stadt essen, wo du die Karte kaum verstehst, oder gleich dein Lieblingsgericht von zu Hause finden?',
      },
      museum: {
        prompt:
          'Zwei Stunden allein durchs Museum streifen oder eine halbe Stunde mit jemandem verbringen, der die ganze Geschichte hinter einem einzigen Bild kennt?',
      },
      cinema: {
        prompt:
          'Im Kino einen Film wiedersehen, den du mitsprechen kannst, oder einen neuen von deinem Lieblingsregisseur ohne Trailer oder Vorwissen?',
      },
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
    finishDifferent_one:
      'Bei {{count}} Frage habt ihr euch unterschiedlich gesehen.',
    finishDifferent_other:
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
