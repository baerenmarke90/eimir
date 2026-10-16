import type { PreferenceCategory } from '../api/generated/models/PreferenceCategory';
import { PreferenceCategory as PreferenceCategoryValues } from '../api/generated/models/PreferenceCategory';
import type { PreferenceSentiment } from '../api/generated/models/PreferenceSentiment';
import { PreferenceSentiment as PreferenceSentimentValues } from '../api/generated/models/PreferenceSentiment';
import type { ProfilePreferenceCreate } from '../api/generated/models/ProfilePreferenceCreate';
import type { ProfilePreferenceUpdate } from '../api/generated/models/ProfilePreferenceUpdate';
import type { ProfileVisibility } from '../api/generated/models/ProfileVisibility';

export interface ProfilePreferenceDraft {
  category: PreferenceCategory;
  sentiment: PreferenceSentiment;
  topic: string;
  value: string;
}

export const CATEGORIES = Object.values(PreferenceCategoryValues);
export const SENTIMENTS = Object.values(PreferenceSentimentValues);

export const EMPTY_PROFILE_PREFERENCE_DRAFT: ProfilePreferenceDraft = {
  category: PreferenceCategoryValues.OTHER,
  sentiment: PreferenceSentimentValues.LIKE,
  topic: '',
  value: '',
};

export function profilePreferenceCreateFromDraft(
  draft: ProfilePreferenceDraft,
  accountId: string,
  visibility: ProfileVisibility,
): ProfilePreferenceCreate {
  return {
    accountId,
    category: draft.category,
    sentiment: draft.sentiment,
    topic: draft.topic.trim(),
    value: draft.value.trim(),
    visibility,
  };
}

export function profilePreferenceUpdateFromDraft(
  draft: ProfilePreferenceDraft,
): ProfilePreferenceUpdate {
  return {
    category: draft.category,
    sentiment: draft.sentiment,
    topic: draft.topic.trim(),
    value: draft.value.trim(),
  };
}
