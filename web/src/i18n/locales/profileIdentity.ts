const profileIdentity = {
  title: 'Dein Profil',
  intro:
    'Hier legst du fest, wie du für deinen Partner in eimir. sichtbar bist.',
  previewLabel: 'Vorschau für deinen Partner',
  displayNameLabel: 'Anzeigename',
  displayNameHelp:
    'Der Anzeigename ändert nur deine sichtbare Darstellung. Anmeldung und Konto bleiben unverändert.',
  editProfile: 'Profil bearbeiten',
  closeProfileEdit: 'Bearbeitung schließen',
  editName: 'Name ändern',
  birthdayLabel: 'Geburtstag',
  birthdayValue: 'Geburtstag: {{date}}',
  birthdayHelp:
    'Optional. Dein Geburtstag ist für deinen aktiven Partner sichtbar und wird automatisch unter euren besonderen Tagen berücksichtigt. Leer lassen entfernt ihn.',
  editBirthday: 'Geburtstag ändern',
  saveBirthday: 'Geburtstag speichern',
  savingBirthday: 'Wird gespeichert …',
  birthdaySaveError: 'Der Geburtstag konnte nicht gespeichert werden.',
  saveName: 'Anzeigenamen speichern',
  savingName: 'Wird gespeichert …',
  saved: 'Profil wurde gespeichert.',
  avatarLabel: 'Profilbild',
  avatarHelp:
    'Wähle ein Bild aus. Ohne Profilbild verwendet eimir. automatisch deine Initialen.',
  chooseAvatar: 'Profilbild auswählen',
  changeAvatar: 'Bild ändern',
  partnerVisibilityNote: 'Dies ist das Profil, das dein Partner sieht.',
  replacingAvatar: 'Profilbild wird aktualisiert …',
  removeAvatar: 'Profilbild entfernen',
  removingAvatar: 'Profilbild wird entfernt …',
  uploadPreparing: 'Upload wird vorbereitet …',
  uploadUploading: 'Profilbild wird hochgeladen …',
  uploadValidating: 'Profilbild wird geprüft …',
  imageAlt: 'Profilbild von {{name}}',
  fallbackAlt: 'Profilbild-Platzhalter für {{name}}',
  loadAvatarFailed:
    'Das Profilbild konnte nicht geladen werden. Die Initialen werden stattdessen angezeigt.',
  partnerTitle: 'Dein Partner',
  partnerIntro:
    'So ist dein Partner aktuell in eimir. sichtbar. Änderungen am eigenen Profil erscheinen hier automatisch.',
  settingsTitle: 'Einstellungen',
  settingsIntro:
    'Hier verwaltest du deine persönlichen App-Einstellungen, Verbindungen und Daten.',
  settingsPageIntro:
    'Wähle den Bereich, den du anpassen möchtest. Jede Einstellung bleibt dort, wo du sie erwartest.',
  settingsIdentity: 'Profilbild und Anzeigename',
  settingsRelationship: 'Partner und Verbindung',
  settingsRelationshipIntro:
    'Verwalte euren gemeinsamen Startpunkt und die Verbindung zu deinem Partner.',
  spaceConfigurationTitle: 'Gemeinsame Funktionen',
  spaceConfigurationManagerIntro:
    'Lege fest, welche bereits verfügbaren gemeinsamen Funktionen ihr in diesem Bereich nutzt.',
  spaceConfigurationReadOnlyIntro:
    'Du siehst hier den gemeinsamen Zustand. Änderungen sind für dein Konto nicht verfügbar.',
  spaceConfigurationLoading: 'Gemeinsame Funktionen werden geladen …',
  spaceConfigurationSaving: 'Wird gespeichert …',
  spaceConfigurationSaved: '✓ Gespeichert',
  supportGesturesTitle: 'Ich denke an dich',
  supportGesturesIntro:
    'Erlaubt euch, dem Partner mit einem kurzen Signal zu zeigen, dass ihr gerade aneinander denkt.',
  supportGesturesToggle: 'Ich denke an dich aktivieren oder deaktivieren',
  supportGesturesCurrentState: 'Ich denke an dich: {{state}}',
  vibeCheckTitle: 'Vibe-Check',
  vibeCheckIntro:
    'Teilt euren heutigen Vibe miteinander. Wer nichts einträgt, erscheint auf „Wir“ auch nicht als leerer Status.',
  vibeCheckToggle: 'Vibe-Check aktivieren oder deaktivieren',
  spaceModuleOn: 'Aktiv',
  spaceModuleOff: 'Aus',
  settingsNotifications: 'Benachrichtigungen',
  settingsNotificationsIntro:
    'Lege fest, wie eimir. dich über Neuigkeiten informiert. Deine aktuellen Mitteilungen findest du im Posteingang.',
  settingsNotificationsAction: 'Zum Benachrichtigungs-Posteingang',
  settingsToday: 'Wir',
  settingsTodayIntro:
    'Lege fest, welche Bereiche und wie viele kommende Einträge du auf „Wir“ sehen möchtest.',
  settingsDashboard: 'Inhalte auf „Wir“',
  settingsDashboardIntro:
    'Entscheide, welche Bereiche auf „Wir“ für dich sichtbar sind.',
  dashboardModulesTitle: 'Sichtbare Bereiche',
  dashboardModulesIntro:
    'Blende einzelne Bereiche für dich aus oder wieder ein. Dein Partner sieht weiterhin seine eigene Auswahl.',
  dashboardModuleSaving: 'Wird gespeichert …',
  dashboardModuleSaved: '✓ Gespeichert',
  dashboardUpcomingTitle: 'Demnächst',
  dashboardUpcomingQuestion: 'Wie viele Einträge möchtest du sehen?',
  dashboardUpcomingLoading: 'Dashboard-Einstellung wird geladen …',
  dashboardUpcomingSaving: 'Wird gespeichert …',
  dashboardUpcomingSaved: '✓ Gespeichert',
  anniversaryReminderTitle: 'Jahrestag-Erinnerung',
  anniversaryReminderIntro:
    'Hier kannst du einstellen, ob und wann du an euren nächsten Jahrestag erinnert werden möchtest.',
  anniversaryReminderToggle: 'An unseren Jahrestag erinnern',
  anniversaryReminderToggleHelp:
    'Sendet dir rechtzeitig persönliche Benachrichtigungen vor eurem Jahrestag.',
  anniversaryReminderDaysHeading: 'Erinnerungszeitpunkte vor dem Jahrestag',
  anniversaryReminderDay30: '30 Tage vorher',
  anniversaryReminderDay7: '7 Tage vorher',
  anniversaryReminderDay1: '1 Tag vorher',
  anniversaryReminderTimeLabel: 'Uhrzeit der Benachrichtigung',
  anniversaryReminderSave: 'Änderungen speichern',
  anniversaryReminderSaving: 'Wird gespeichert …',
  anniversaryReminderSaved: '✓ Gespeichert',
  anniversaryReminderLoading: 'Einstellungen werden geladen …',
  partnerBirthdayReminderToggle: 'An den Geburtstag meines Partners erinnern',
  partnerBirthdayReminderToggleHelp:
    'Diese persönliche Einstellung betrifft nur deine Erinnerungen. Der Geburtstag selbst bleibt für euch sichtbar.',
  partnerBirthdayReminderDaysHeading:
    'Erinnerungszeitpunkte vor dem Geburtstag',
  partnerBirthdayReminderDay14: '14 Tage vorher',
  partnerBirthdayReminderDay7: '7 Tage vorher',
  partnerBirthdayReminderDay1: '1 Tag vorher',
  partnerBirthdayReminderTimeLabel: 'Uhrzeit der Geburtstagserinnerung',
  partnerBirthdayReminderLoading: 'Geburtstagserinnerung wird geladen …',
  settingsPrivacy: 'Privater Bereich',
  settingsData: 'Daten und Portabilität',
  settingsDataIntro:
    'Exportiere deine Daten oder importiere unterstützte Inhalte mit den bestehenden Prüfungen.',
  settingsAccount: 'Konto und gemeinsamer Bereich',
  settingsAccountIntro:
    'Verlassen des gemeinsamen Bereichs und Löschen deines Kontos bleiben getrennte, bewusst bestätigte Aktionen.',
  settingsBackToMore: 'Zurück zu Mehr',
  settingsBackToIndex: 'Zurück zu Einstellungen',
  settingsSensitiveEyebrow: 'Mit Bedacht',
  settingsSensitiveTitle: 'Sensible Aktionen',
  settingsSensitiveIntro:
    'Den gemeinsamen Bereich zu verlassen und dein Konto zu löschen sind getrennte Aktionen. Prüfe die jeweiligen Folgen, bevor du fortfährst.',
  appearanceIntro:
    'Wähle, ob eimir. der Systemeinstellung folgen oder dauerhaft hell beziehungsweise dunkel dargestellt werden soll.',
} as const;

export default profileIdentity;
