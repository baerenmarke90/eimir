const memoryProduct = {
  open: 'Erinnerung öffnen',
  backToStory: '← Zurück zu Momente',
  backToMemory: '← Zurück zur Erinnerung',
  detailEyebrow: 'Erinnerung',
  detailMetaAria: 'Angaben zu dieser Erinnerung',
  detailIntro: 'Alle Details zu diesem gemeinsamen Moment.',
  provenance: 'Festgehalten von {{author}} am {{createdAt}}',
  loading: 'Erinnerung wird geladen …',
  authorLabel: 'Festgehalten von',
  happenedOnLabel: 'Datum',
  createdAtLabel: 'Erstellt',
  noDate: 'Kein Datum angegeben',
  noBody: 'Zu dieser Erinnerung gibt es keinen zusätzlichen Text.',
  photosHeading: 'Fotos',
  galleryAria: 'Fotos dieser Erinnerung',
  noPhotos: 'Zu dieser Erinnerung sind keine Fotos gespeichert.',
  edit: 'Bearbeiten',
  delete: 'Löschen',
  deleteConfirmTitle: 'Erinnerung wirklich löschen?',
  deleteConfirmBody:
    'Die Erinnerung wird dauerhaft aus eurem gemeinsamen Bereich entfernt.',
  deleteConfirm: 'Endgültig löschen',
  deleteCancel: 'Nicht löschen',
  deleting: 'Wird gelöscht …',
  editEyebrow: 'Erinnerung bearbeiten',
  editHeading: 'Erinnerung bearbeiten',
  editIntro:
    'Passe Titel, Text, Datum oder Fotos an. Änderungen werden nur auf dem aktuellen Stand gespeichert.',
  formAria: 'Erinnerung bearbeiten',
  save: 'Änderungen speichern',
  saving: 'Wird gespeichert …',
  existingPhotosHeading: 'Vorhandene Fotos',
  existingPhotosHelp:
    'Markierte Fotos werden erst entfernt, wenn du die Änderungen speicherst.',
  markPhotoForRemoval: 'Foto beim Speichern entfernen',
  keepPhoto: 'Foto behalten',
  photoMarkedForRemoval: 'Wird beim Speichern entfernt',
  newPhotosHeading: 'Neue Fotos',
  editPhotosPreserved:
    'Nicht entfernte Fotos bleiben in ihrer Reihenfolge erhalten. Neue Fotos werden hinten an die Galerie angefügt.',
  editNotAllowedTitle: 'Diese Erinnerung kann nicht bearbeitet werden.',
  editNotAllowedBody:
    'Dein aktueller Zugriff erlaubt keine Änderungen an dieser Erinnerung.',
  createFallbackTitle: 'Erinnerung vom {{date}}',
} as const;

export default memoryProduct;
