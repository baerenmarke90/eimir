const memoryProduct = {
  planning: {
    heading: 'Verknüpfte Wünsche und Pläne',
    detailHeading: 'Verknüpft mit',
    linkedPlan: 'Verknüpfter Plan',
    linkedWish: 'Verknüpfter Wunsch',
    add: 'Wunsch oder Plan verknüpfen',
    plans: 'Pläne',
    wishes: 'Wünsche',
    empty: 'Hier gibt es noch keine passenden Wünsche oder Pläne.',
    remove: 'Verknüpfung mit „{{title}}“ entfernen',
  },
  detailEyebrow: 'Erinnerung',
  provenance: 'Festgehalten von {{author}} am {{createdAt}}',
  loading: 'Erinnerung wird geladen …',
  noDate: 'Kein Datum angegeben',
  menu: 'Menü der Erinnerung',
  deleteConfirmTitle: 'Erinnerung wirklich löschen?',
  deleteConfirmBody:
    'Die Erinnerung wird dauerhaft aus eurem gemeinsamen Bereich entfernt.',
  deleteConfirm: 'Endgültig löschen',
  editHeading: 'Erinnerung bearbeiten',
  formAria: 'Erinnerung bearbeiten',
  save: 'Änderungen speichern',
  markPhotoForRemoval: 'Foto beim Speichern entfernen',
  keepPhoto: 'Foto behalten',
  photoMarkedForRemoval: 'Wird beim Speichern entfernt',
  editNotAllowedTitle: 'Diese Erinnerung kann nicht bearbeitet werden.',
  editNotAllowedBody:
    'Dein aktueller Zugriff erlaubt keine Änderungen an dieser Erinnerung.',
  createFallbackTitle: 'Erinnerung vom {{date}}',
} as const;

export default memoryProduct;
