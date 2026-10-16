const people = {
  eyebrow: 'Wichtige Menschen',
  title: 'Menschen in eurem Leben',
  intro:
    'Haltet Personen fest, die für euch wichtig sind. Sichtbarkeit und persönliche Angaben bleiben bewusst unter eurer Kontrolle.',
  formRailAria: 'Person anlegen oder bearbeiten',
  createTitle: 'Person hinzufügen',
  editTitle: 'Person bearbeiten',
  identitySectionTitle: 'Wer ist diese Person?',
  identitySectionHelp:
    'Name, Foto und eure Beziehung stehen hier im Mittelpunkt.',
  nameLabel: 'Name',
  relationshipLabel: 'Beziehung',
  birthdayLabel: 'Geburtstag',
  birthdayOptionalHelp:
    'Optional – nur ergänzen, wenn es für euch hilfreich ist.',
  birthdayDateLabel: 'Geburtsdatum',
  birthdayYearKnown: 'Das Geburtsjahr ist bekannt',
  birthdayDayLabel: 'Tag',
  birthdayMonthLabel: 'Monat',
  birthdayMonthPlaceholder: 'Monat auswählen',
  birthdayUnknownYearHelp:
    'Wenn das Geburtsjahr unbekannt ist, speichert und zeigt eimir. nur Tag und Monat.',
  birthdayShowOnDashboard: 'Geburtstag auf Wir anzeigen',
  birthdayShowOnDashboardHelp:
    'Erscheint dann für euch beide unter Wir. Unabhängig von Erinnerungen, die ihr separat einstellt.',
  visibilityLabel: 'Sichtbarkeit',
  visibilityHelp:
    'Geteilte Personen sind für euch beide sichtbar. Private Personen bleiben nur bei dir.',
  lifecycleTitle: 'Person entfernen',
  lifecycleHelp:
    'Das Löschen bleibt bewusst getrennt vom Speichern. Verknüpfte Termine werden erst im nächsten Schritt behandelt.',
  create: 'Person hinzufügen',
  saveChanges: 'Änderungen speichern',
  saving: 'Wird gespeichert …',
  created: 'Person wurde hinzugefügt.',
  updated: 'Änderungen wurden gespeichert.',
  deleted: 'Person wurde gelöscht.',
  loading: 'Wichtige Menschen werden geladen …',
  listKicker: 'Euer Umfeld',
  listTitle: 'Gespeicherte Personen',
  listAria: 'Wichtige Menschen',
  emptyTitle: 'Noch keine Person gespeichert',
  emptyBody:
    'Fügt hier Menschen hinzu, die in eurem gemeinsamen Leben wichtig sind.',
  birthdayValue: 'Geburtstag: {{date}}',
  edit: 'Bearbeiten',
  delete: 'Löschen',
  deleteTitle: 'Person löschen',
  deleteBody:
    'Wie sollen verknüpfte Termine behandelt werden, wenn du {{name}} löschst?',
  deletePrivacyNote:
    'Mit dieser Person verknüpfte Termine können auch Einträge deines Partners enthalten. Deshalb zeigen wir hier bewusst keine Anzahl oder Details.',
  deletePolicyLegend: 'Verknüpfte Termine',
  deletePreserveTitle: 'Termine erhalten',
  deletePreserveBody:
    'Die Person wird gelöscht. Verknüpfte Termine bleiben erhalten und werden von der Person gelöst.',
  deleteCascadeTitle: 'Termine mit löschen',
  deleteCascadeBody:
    'Die Person und alle mit ihr verknüpften Termine werden gemeinsam gelöscht.',
  deleteCascadeWarningTitle: 'Dauerhaft löschen',
  deleteCascadeWarningBody:
    'Diese Auswahl kann auch verknüpfte Termine entfernen, die du nicht sehen kannst. Die Löschung lässt sich nicht rückgängig machen.',
  deleteCascadeConfirm:
    'Ich möchte die Person und die verknüpften Termine wirklich löschen.',
  deleteConfirm: 'Person löschen',
  deleting: 'Wird gelöscht …',
  discardTitle: 'Ungespeicherte Änderungen verwerfen?',
  discardBody:
    'Möchtest du den Editor wirklich schließen? Deine Änderungen gehen verloren.',
  discardConfirm: 'Änderungen verwerfen',
  keepEditing: 'Weiter bearbeiten',
  avatarLabel: 'Profilbild',
  avatarUpload: 'Foto auswählen',
  avatarChange: 'Foto ändern',
  avatarRemove: 'Foto entfernen',
  avatarAlt: 'Foto von {{name}}',
  avatarUploading: 'Foto wird hochgeladen …',
  avatarValidating: 'Foto wird geprüft …',
  addPersonAction: 'Person hinzufügen',
  closeDialogAria: 'Schließen',
  relationship: {
    CHILD: 'Kind',
    PARENT: 'Elternteil',
    SIBLING: 'Geschwister',
    FRIEND: 'Freund oder Freundin',
    OTHER: 'Andere Beziehung',
  },
  visibility: {
    SHARED: 'Für uns beide',
    PRIVATE: 'Nur für mich',
  },
} as const;

export default people;
