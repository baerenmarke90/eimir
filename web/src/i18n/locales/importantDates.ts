const importantDates = {
  heading: 'Besondere Tage',
  intro:
    'Geburtstage, Jahrestage und andere besondere Tage könnt ihr hier gemeinsam oder nur für euch festhalten.',
  createTitle: 'Besonderer Tag',
  editTitle: 'Besonderen Tag ändern',
  meaningSectionTitle: 'Anlass',
  meaningSectionHelp:
    'Datum und Anlass stehen zuerst. Alles Weitere bleibt bewusst nachgeordnet.',
  relationshipSectionTitle: 'Person',
  relationshipSectionHelp:
    'Verknüpfe den Tag optional mit einer Person aus eurem Umfeld.',
  detailsTitle: 'Art und Wiederholung',
  lifecycleTitle: 'Besonderen Tag entfernen',
  lifecycleHelp:
    'Löschen ist bewusst vom Speichern getrennt und wird noch einmal bestätigt.',
  labelLabel: 'Titel',
  dateLabel: 'Datum',
  typeLabel: 'Art',
  repeatLabel: 'Wiederholung',
  personLabel: 'Für wen ist dieser Tag?',
  personNone: 'Keine',
  visibilityLabel: 'Wer kann das sehen?',
  visibilityHelp:
    'Geteilte Tage sind für euch beide sichtbar. Private Tage bleiben nur bei dir.',
  create: 'Tag hinzufügen',
  saveChanges: 'Speichern',
  saving: 'Wird gespeichert …',
  created: 'Besonderer Tag wurde festgehalten.',
  updated: 'Änderungen wurden gespeichert.',
  deleted: 'Besonderer Tag wurde gelöscht.',
  loading: 'Besondere Tage werden geladen …',
  listTitle: 'Eure besonderen Tage',
  emptyTitle: 'Noch kein besonderer Tag festgehalten',
  emptyBody:
    'Haltet hier Tage fest, an die ihr euch erinnern oder die ihr gemeinsam im Blick behalten möchtet.',
  dateValue: '{{date}}',
  linkedPerson: 'Für {{name}}',
  partnerBirthdayLabel: 'Geburtstag von {{name}}',
  partnerBirthdayProfileSource: 'Aus dem Profil von {{name}}',
  edit: 'Bearbeiten',
  delete: 'Löschen',
  deleteQuestion: 'Diesen besonderen Tag wirklich löschen?',
  deleteBody:
    'Dieser Tag wird dauerhaft entfernt. Verknüpfte Personen bleiben erhalten.',
  deleteConfirm: 'Besonderen Tag löschen',
  deleting: 'Wird gelöscht …',
  discardTitle: 'Ungespeicherte Änderungen verwerfen?',
  discardBody:
    'Möchtest du den Editor wirklich schließen? Deine Änderungen gehen verloren.',
  discardConfirm: 'Änderungen verwerfen',
  keepEditing: 'Weiter bearbeiten',
  closeDialogAria: 'Dialog schließen',
  type: {
    BIRTHDAY: 'Geburtstag',
    ANNIVERSARY: 'Jahrestag',
    CUSTOM: 'Besonderer Tag',
  },
  repeats: {
    NONE: 'Keine Wiederholung',
    ANNUALLY: 'Jährlich',
  },
  visibility: {
    SHARED: 'Für uns beide',
    PRIVATE: 'Nur für mich',
  },
} as const;

export default importantDates;
