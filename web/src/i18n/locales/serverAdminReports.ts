import { i18n } from '../index';
import type { SupportedLocale } from '../resources';

/*
 * Copy of the ServerAdmin "Reports" section (#2189). It is registered when the
 * section's lazily loaded code runs instead of being bundled with the app
 * entry, which has a fixed size budget. The packs stay complete and in
 * parity; `i18n.test.ts` checks them together with the bundled packs.
 */

const de = {
  title: 'Meldungen',
  body: 'Problem- und Feedback-Meldungen aus der App. Die Liste zeigt keine Notizen; den Text siehst du erst in der geöffneten Meldung.',
  newCount: 'Neu: {{count}}',
  filter: {
    label: 'Meldungen nach Status filtern',
    all: 'Alle',
    NEW: 'Neu',
    IN_PROGRESS: 'In Bearbeitung',
    CLOSED: 'Erledigt',
  },
  states: {
    NEW: 'Neu',
    IN_PROGRESS: 'In Bearbeitung',
    CLOSED: 'Erledigt',
  },
  kinds: {
    PROBLEM: 'Problem',
    FEEDBACK: 'Feedback',
  },
  loadingTitle: 'Meldungen werden geladen',
  loadingBody: 'Die Meldungen dieser Installation werden abgefragt.',
  errorTitle: 'Meldungen nicht verfügbar',
  errorBody: 'Die Meldungen konnten nicht geladen werden.',
  offlineTitle: 'Keine Verbindung',
  offlineBody:
    'Die Meldungen können erst wieder geladen werden, wenn die Verbindung zurück ist.',
  offlineNotice:
    'Du bist offline. Änderungen an Meldungen sind erst wieder möglich, wenn die Verbindung zurück ist.',
  retry: 'Erneut laden',
  emptyTitle: 'Keine Meldungen',
  emptyNewBody: 'Es gibt gerade keine neuen Meldungen.',
  emptyFilteredBody: 'Für diesen Status gibt es keine Meldungen.',
  emptyAllBody: 'Bisher ist keine Meldung eingegangen.',
  showAll: 'Alle Meldungen zeigen',
  loadMore: 'Weitere Meldungen laden',
  loadingMore: 'Weitere Meldungen werden geladen …',
  loadMoreError: 'Weitere Meldungen konnten nicht geladen werden.',
  listLabel: 'Meldungen',
  item: {
    version: 'Version {{version}} ({{build}})',
    replied: 'Beantwortet',
    ticket: 'Ticket',
  },
  detail: {
    back: 'Zurück zur Liste',
    eyebrow: 'Meldung',
    heading: '{{kind}} vom {{date}}',
    loading: 'Meldung wird geladen …',
    error: 'Die Meldung konnte nicht geladen werden.',
    noteTitle: 'Notiz der Person',
    noNote: 'Die Person hat keine Notiz geschrieben.',
    privacy:
      'Die Notiz ist privater Text. Sie erscheint nur hier und wird nie in ein Ticket, ein Protokoll oder eine Auswertung übernommen.',
    factsTitle: 'Technische Angaben',
    createdAt: 'Eingegangen',
    appVersion: 'App-Version',
    build: 'Build',
    platform: 'Plattform',
    os: 'Betriebssystem',
    engine: 'Browser-Engine',
    locale: 'Sprache',
    timeZone: 'Zeitzone',
    theme: 'Darstellung',
    online: 'Beim Senden online',
    yes: 'Ja',
    no: 'Nein',
    failureReference: 'Fehlerreferenz',
    requestId: 'Request-ID',
    accountId: 'Account-ID',
    accountHint:
      'Den Account findest du in der Benutzerverwaltung über diese ID.',
    none: '–',
    stateTitle: 'Bearbeitungsstand',
    stateSaved: 'Status gespeichert: {{state}}.',
  },
  reply: {
    title: 'Antwort',
    label: 'Antwort an die Person',
    hint: 'Die Antwort wird genau einmal gesendet und kann danach nicht bearbeitet werden. Höchstens 500 Zeichen, nur Text.',
    counter: '{{length}} / {{max}}',
    counterLabel: '{{length}} von {{max}} Zeichen',
    tooLong: 'Die Antwort ist länger als 500 Zeichen.',
    send: 'Antwort einmalig senden',
    sending: 'Antwort wird gesendet …',
    sent: 'Die Antwort wurde gesendet.',
    sentTitle: 'Gesendete Antwort',
    sentAt: 'Gesendet am {{date}}',
    readOnly: 'Eine gesendete Antwort kann nicht mehr geändert werden.',
    discardConfirm:
      'Die Antwort ist noch nicht gesendet. Zur Liste zurückkehren und den Entwurf verwerfen?',
  },
  ticket: {
    title: 'Ticket',
    none: 'Zu dieser Meldung gibt es noch kein Ticket.',
    create: 'Ticket erstellen',
    unavailable:
      'Für diese Installation ist kein Tracker eingerichtet, deshalb können keine Tickets erstellt werden.',
    open: 'Ticket {{number}} öffnen',
    openWithoutNumber: 'Ticket öffnen',
    opensExternal: 'öffnet den Tracker in einem neuen Fenster',
    created: 'Ticket erstellt',
    createdNotice: 'Das Ticket wurde erstellt.',
    pending: 'Das Ticket wird gerade erstellt.',
    uncertain: 'Unklar, ob das Ticket entstanden ist. Prüfe den Tracker.',
    uncertainHint:
      'Wenn es im Tracker kein Ticket gibt, entferne die Verknüpfung und erstelle es neu.',
    clear: 'Ticket-Verknüpfung entfernen',
    confirmClear:
      'Ticket-Verknüpfung wirklich entfernen? Falls das Ticket im Tracker doch entstanden ist, entsteht beim nächsten Erstellen ein Duplikat. Prüfe den Tracker vorher.',
    cleared: 'Die Ticket-Verknüpfung wurde entfernt.',
  },
  ticketDialog: {
    eyebrow: 'Tracker',
    title: 'Ticket erstellen',
    intro:
      'Du schreibst Titel und Beschreibung selbst. Die Notiz der Person und deine Antwort werden nie automatisch übernommen. Schreibe nichts Privates in das Ticket.',
    titleLabel: 'Titel',
    titleTemplate: '{{kind}} in Version {{appVersion}}',
    titleRequired: 'Der Titel darf nicht leer sein.',
    titleTooLong: 'Der Titel ist länger als 256 Zeichen.',
    bodyLabel: 'Beschreibung (optional)',
    bodyTooLong: 'Die Beschreibung ist zu lang für den Tracker.',
    footerLabel: 'Wird vom Server unverändert angehängt',
    submit: 'Ticket erstellen',
    submitting: 'Ticket wird erstellt …',
    cancel: 'Abbrechen',
  },
  errors: {
    alreadyReplied:
      'Auf diese Meldung wurde bereits geantwortet. Die gesendete Antwort wird angezeigt.',
    ticketExists: 'Zu dieser Meldung gibt es bereits ein Ticket.',
    ticketNotConfigured:
      'Für diese Installation ist kein Tracker eingerichtet.',
    ticketTooLong:
      'Titel und Beschreibung sind mit den technischen Angaben zu lang für den Tracker.',
    ticketFailedRetryable:
      'Der Tracker hat das Ticket nicht erstellt. Prüfe den Tracker; die Verknüpfung bleibt offen, bis du sie entfernst.',
    ticketFailed:
      'Der Tracker hat das Ticket abgelehnt. Prüfe die Tracker-Einrichtung; die Verknüpfung bleibt offen, bis du sie entfernst.',
    offline: 'Du bist offline. Die Änderung wurde nicht gesendet.',
    notFound: 'Diese Meldung gibt es nicht mehr.',
    validation: 'Die Eingabe wurde vom Server nicht angenommen.',
    generic: 'Die Aktion konnte nicht ausgeführt werden.',
  },
};

const en: typeof de = {
  title: 'Reports',
  body: 'Problem and feedback reports from the app. The list shows no notes; you see the text only in the opened report.',
  newCount: 'New: {{count}}',
  filter: {
    label: 'Filter reports by status',
    all: 'All',
    NEW: 'New',
    IN_PROGRESS: 'In progress',
    CLOSED: 'Done',
  },
  states: {
    NEW: 'New',
    IN_PROGRESS: 'In progress',
    CLOSED: 'Done',
  },
  kinds: {
    PROBLEM: 'Problem',
    FEEDBACK: 'Feedback',
  },
  loadingTitle: 'Loading reports',
  loadingBody: 'The reports of this installation are being queried.',
  errorTitle: 'Reports unavailable',
  errorBody: 'The reports could not be loaded.',
  offlineTitle: 'No connection',
  offlineBody: 'The reports can be loaded again once the connection is back.',
  offlineNotice:
    'You are offline. Changes to reports are possible again once the connection is back.',
  retry: 'Load again',
  emptyTitle: 'No reports',
  emptyNewBody: 'There are no new reports right now.',
  emptyFilteredBody: 'There are no reports with this status.',
  emptyAllBody: 'No report has arrived yet.',
  showAll: 'Show all reports',
  loadMore: 'Load more reports',
  loadingMore: 'Loading more reports …',
  loadMoreError: 'More reports could not be loaded.',
  listLabel: 'Reports',
  item: {
    version: 'Version {{version}} ({{build}})',
    replied: 'Replied',
    ticket: 'Ticket',
  },
  detail: {
    back: 'Back to the list',
    eyebrow: 'Report',
    heading: '{{kind}} from {{date}}',
    loading: 'Loading report …',
    error: 'The report could not be loaded.',
    noteTitle: 'Note from the person',
    noNote: 'The person wrote no note.',
    privacy:
      'The note is private text. It appears only here and is never copied into a ticket, a log or an analysis.',
    factsTitle: 'Technical details',
    createdAt: 'Received',
    appVersion: 'App version',
    build: 'Build',
    platform: 'Platform',
    os: 'Operating system',
    engine: 'Browser engine',
    locale: 'Language',
    timeZone: 'Time zone',
    theme: 'Appearance',
    online: 'Online when sent',
    yes: 'Yes',
    no: 'No',
    failureReference: 'Failure reference',
    requestId: 'Request ID',
    accountId: 'Account ID',
    accountHint: 'Find the account in user management with this ID.',
    none: '–',
    stateTitle: 'Triage status',
    stateSaved: 'Status saved: {{state}}.',
  },
  reply: {
    title: 'Reply',
    label: 'Reply to the person',
    hint: 'The reply is sent exactly once and cannot be edited afterwards. At most 500 characters, text only.',
    counter: '{{length}} / {{max}}',
    counterLabel: '{{length}} of {{max}} characters',
    tooLong: 'The reply is longer than 500 characters.',
    send: 'Send reply once',
    sending: 'Sending reply …',
    sent: 'The reply was sent.',
    sentTitle: 'Sent reply',
    sentAt: 'Sent on {{date}}',
    readOnly: 'A sent reply cannot be changed.',
    discardConfirm:
      'The reply has not been sent yet. Return to the list and discard the draft?',
  },
  ticket: {
    title: 'Ticket',
    none: 'This report has no ticket yet.',
    create: 'Create ticket',
    unavailable:
      'No tracker is set up for this installation, so no tickets can be created.',
    open: 'Open ticket {{number}}',
    openWithoutNumber: 'Open ticket',
    opensExternal: 'opens the tracker in a new window',
    created: 'Ticket created',
    createdNotice: 'The ticket was created.',
    pending: 'The ticket is being created.',
    uncertain: 'Uncertain whether the ticket was created. Check the tracker.',
    uncertainHint:
      'If the tracker has no ticket, remove the link and create it again.',
    clear: 'Remove ticket link',
    confirmClear:
      'Really remove the ticket link? If the ticket was created in the tracker after all, creating it again makes a duplicate. Check the tracker first.',
    cleared: 'The ticket link was removed.',
  },
  ticketDialog: {
    eyebrow: 'Tracker',
    title: 'Create ticket',
    intro:
      "You write the title and description yourself. The person's note and your reply are never copied automatically. Do not write anything private into the ticket.",
    titleLabel: 'Title',
    titleTemplate: '{{kind}} in version {{appVersion}}',
    titleRequired: 'The title must not be empty.',
    titleTooLong: 'The title is longer than 256 characters.',
    bodyLabel: 'Description (optional)',
    bodyTooLong: 'The description is too long for the tracker.',
    footerLabel: 'Appended unchanged by the server',
    submit: 'Create ticket',
    submitting: 'Creating ticket …',
    cancel: 'Cancel',
  },
  errors: {
    alreadyReplied:
      'This report has already been replied to. The sent reply is shown.',
    ticketExists: 'This report already has a ticket.',
    ticketNotConfigured: 'No tracker is set up for this installation.',
    ticketTooLong:
      'Title and description are too long for the tracker together with the technical details.',
    ticketFailedRetryable:
      'The tracker did not create the ticket. Check the tracker; the link stays open until you remove it.',
    ticketFailed:
      'The tracker refused the ticket. Check the tracker setup; the link stays open until you remove it.',
    offline: 'You are offline. The change was not sent.',
    notFound: 'This report no longer exists.',
    validation: 'The server did not accept the input.',
    generic: 'The action could not be completed.',
  },
};

export const serverAdminReportsLocales: Record<
  SupportedLocale,
  { serverAdmin: { reports: typeof de } }
> = {
  de: { serverAdmin: { reports: de } },
  en: { serverAdmin: { reports: en } },
};

/** German copy, for tests that assert visible text. */
export const serverAdminReportsCopy = de;

/** Adds the section's copy to every language; repeated calls are harmless. */
export function registerServerAdminReportsLocale(): void {
  for (const [locale, pack] of Object.entries(serverAdminReportsLocales)) {
    i18n.addResourceBundle(locale, 'translation', pack, true, false);
  }
}
