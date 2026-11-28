/**
 * #1907 F2: a quiet line on a memory that happened on one of the couple's
 * occasions. German ordinals only need the `other` category; `one` is
 * present because the pack check expects every cardinal category per group.
 */
const occasionMarks = {
  anniversary_ordinal_one: 'An eurem {{count}}. Jahrestag',
  anniversary_ordinal_other: 'An eurem {{count}}. Jahrestag',
  relationshipStart: 'Am Tag, an dem alles begann',
  ownBirthday: 'An deinem Geburtstag',
  partnerBirthday: 'Am Geburtstag von {{name}}',
  more_one: 'und ein weiterer Anlass',
  more_other: 'und {{count}} weitere Anlässe',
  // #2072: the Wir stage's middle line on the day itself.
  todayAnniversary_one: 'Heute vor {{count}} Jahr',
  todayAnniversary_other: 'Heute vor {{count}} Jahren',
  todayRelationshipStart: 'Heute beginnt eure Geschichte',
  todayOwnBirthday: 'Alles Gute zum Geburtstag',
  todayPartnerBirthday: 'Alles Gute, {{name}}',
  // #2370: the days together on the anniversary and on a round day; `days`
  // is the count formatted for the locale, `count` picks the plural.
  daysTogether_one: '{{days}} Tag zusammen',
  daysTogether_other: '{{days}} Tage zusammen',
};

export default occasionMarks;
