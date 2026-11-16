const photoEdit = {
  edit: 'Bearbeiten',
  editLabel: 'Foto bearbeiten: {{name}}',
  title: 'Foto bearbeiten',
  help: 'Verschiebe und vergrößere das Foto im Rahmen. Datum und Ort des Fotos bleiben erhalten.',
  stageLabel: 'Foto im Rahmen verschieben',
  keyboardHelp:
    'Die Pfeiltasten verschieben das Foto. Plus und Minus vergrößern oder verkleinern es, die Null setzt den Ausschnitt zurück.',
  aspect: 'Format',
  aspects: {
    original: 'Original',
    square: 'Quadrat',
    classic: '4:3',
    classic_portrait: '3:4',
    wide: '16:9',
    wide_portrait: '9:16',
  },
  turn: 'Drehen',
  zoom: 'Größe',
  confirm: 'Übernehmen',
  confirming: 'Wird vorbereitet …',
  unavailable: 'Dieses Foto kann auf diesem Gerät nicht bearbeitet werden.',
  edited: 'Bearbeitet',
} as const;

export default photoEdit;
