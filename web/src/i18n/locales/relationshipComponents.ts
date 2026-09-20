const relationshipComponents = {
  partnerAvatarConnected: '{{user}} und {{partner}}',
  partnerAvatarWaiting: '{{user}} (Wartet auf Partner)',
  partnerAvatarInvite: 'Partner einladen',

  couplePresenceActive: 'Gerade hier',
  couplePresenceRecent: 'Vor Kurzem hier',
  couplePresenceWaiting: 'Wartet auf Partner',
  couplePresenceDurationAction: 'Beziehungsdetails ansehen',
  couplePresenceYouFallback: 'Du',
  couplePresencePartnerFallback: 'Dein Partner',
  formerMemberLabel: 'Ehemaliges Mitglied',

  thinkingOfYouSendToPartner: 'Lieben Gruß an {{partner}} senden',
  thinkingOfYouAction: 'Ich denke an dich',
  thinkingOfYouSending: 'Wird gesendet …',
  thinkingOfYouSent: 'Gesendet!',
  thinkingOfYouCooldown: 'Wieder möglich in {{minutes}} Min.',
  thinkingOfYouError: 'Senden fehlgeschlagen',

  visibilityShared: 'Mit Partner geteilt',
  visibilityPrivate: 'Nur für mich',
  visibilityTemporary: 'Zeitlich geteilt',
} as const;

export default relationshipComponents;
