/**
 * The closed photo reaction presets and their symbols. Kept apart from the
 * photo gallery so small readers (the Wir reel, #2345 B) do not pull the whole
 * gallery into the app's entry.
 */
export const PHOTO_REACTIONS = [
  { value: 'LOVE', emoji: '❤️' },
  { value: 'LAUGH', emoji: '😂' },
  { value: 'SURPRISE', emoji: '😮' },
  { value: 'SAD', emoji: '😢' },
  { value: 'CELEBRATE', emoji: '🙌' },
  { value: 'LIKE', emoji: '👍' },
] as const;
