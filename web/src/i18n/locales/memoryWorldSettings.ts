const memoryWorldSettings = {
  title: 'Erinnerungswelten',
  help: 'So begegnen dir eure Erinnerungen unter Momente › Erinnerungen – nur in deiner Ansicht.',
  intro:
    'Story und Stapel sind inklusive, alle anderen Welten gehören zu Pro. Deine Partnerperson wählt ihre eigene Welt.',
  choices: 'Welt auswählen',
  change: 'Alle Welten',
  current: 'Aktiv',
  free: 'Inklusive',
  pro: 'Pro',
  choose: '{{name}} wählen',
  selected: 'Ausgewählt',
  saved: '{{name}} ist jetzt deine Welt unter Erinnerungen.',
  kept: '{{name}} bleibt dir auch ohne Pro erhalten. Für eine andere Pro-Welt brauchst du Pro.',
  proHint:
    '{{name}} gehört zu eimir. Pro. Deine jetzige Welt bleibt, bis du wechselst.',
  discover: 'Pro entdecken',
  proLoading: 'Pro wird geprüft …',
  proUnavailable:
    'Pro konnte gerade nicht geprüft werden. Story und Stapel kannst du weiterhin auswählen.',
  denied:
    'Für eine neue Pro-Welt brauchst du Pro. Deine bisherige Welt bleibt erhalten.',
  offline:
    'Du bist gerade offline. Deine Auswahl bleibt hier; speichere sie, wenn du wieder verbunden bist.',
  conflict:
    'Deine Darstellung wurde gerade auf einem anderen Gerät geändert. Öffne die Auswahl noch einmal.',
  saveError: 'Die Welt konnte nicht gespeichert werden.',
  sensitive: {
    label: 'Sensible Fotos in den Welten zeigen',
    shown:
      'Erinnerungen mit sensiblen Fotos erscheinen in den Welten – die Fotos bleiben verdeckt, bis du sie öffnest. Gilt nur auf diesem Gerät.',
    hidden:
      'Erinnerungen mit sensiblen Fotos tauchen in den Welten nicht auf. Im Tagebuch bleiben sie wie gewohnt. Gilt nur auf diesem Gerät.',
  },
  switchWorldCurrent: 'Welt wechseln – gerade: {{name}}',
  worlds: {
    story: {
      name: 'Story',
      sentence: 'Eure Fotostory mit Themen – schlicht und ruhig.',
    },
    stack: {
      name: 'Stapel',
      sentence: 'Abzüge fallen auf einen Stapel, du blätterst sie durch.',
    },
    cloud: {
      name: 'Momentwolke',
      sentence: 'Zieh durch eine schwebende Wolke aus all euren Momenten.',
    },
    mochi: {
      name: 'Mochis',
      sentence:
        'Ihr zwei als kleine Mochis – sie kuscheln, lachen und bringen Erinnerungen.',
    },
    booth: {
      name: 'Fotoautomat',
      sentence:
        'Druck eure Erinnerungen als Fotostreifen aus – klassisch oder modern.',
    },
    album: {
      name: 'Fotobuch',
      sentence: 'Blättere durch euer Fotobuch – Seite für Seite.',
    },
    stars: {
      name: 'Sternbild',
      sentence:
        'Eure Momente als Sterne an einem Himmel, der mit der Zeit lebt.',
    },
    post: {
      name: 'Post',
      sentence: 'Briefe von damals, die ihr öffnet und ablegt.',
    },
    crate: {
      name: 'Plattenkiste',
      sentence: 'Blättere durch eure Platten und leg eine Erinnerung auf.',
    },
    scratch: {
      name: 'Rubbellos',
      sentence: 'Rubbel frei, welche Erinnerung heute auf euch wartet.',
    },
    jar: {
      name: 'Glas',
      sentence: 'Zieh jeden Tag einen Zettel aus eurem Erinnerungsglas.',
    },
    fridge: {
      name: 'Kühlschranktür',
      sentence:
        'Fotos und Zettel unter bunten Magneten – zum Abnehmen und Verschieben.',
    },
  },
} as const;

export default memoryWorldSettings;
