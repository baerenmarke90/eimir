import { PreferenceCategory } from '../api/generated/models/PreferenceCategory';
import { PreferenceSentiment } from '../api/generated/models/PreferenceSentiment';
import { ProfileVisibility } from '../api/generated/models/ProfileVisibility';
import {
  EMPTY_PROFILE_PREFERENCE_DRAFT,
  profilePreferenceCreateFromDraft,
  profilePreferenceUpdateFromDraft,
} from './profilePreferenceDraft';

describe('profile preference form mapping', () => {
  it('uses neutral reusable defaults without inventing identity or visibility', () => {
    expect(EMPTY_PROFILE_PREFERENCE_DRAFT).toEqual({
      category: PreferenceCategory.OTHER,
      sentiment: PreferenceSentiment.LIKE,
      topic: '',
      value: '',
    });
  });

  it('adds server-contract identity and visibility only when creating', () => {
    const create = profilePreferenceCreateFromDraft(
      {
        category: PreferenceCategory.MUSIC,
        sentiment: PreferenceSentiment.LOVE,
        topic: '  Artist  ',
        value: '  Example  ',
      },
      'account-1',
      ProfileVisibility.SELF_PROFILE,
    );

    expect(create).toEqual({
      accountId: 'account-1',
      category: PreferenceCategory.MUSIC,
      sentiment: PreferenceSentiment.LOVE,
      topic: 'Artist',
      value: 'Example',
      visibility: ProfileVisibility.SELF_PROFILE,
    });
  });

  it('keeps immutable account and visibility fields out of updates', () => {
    expect(
      profilePreferenceUpdateFromDraft({
        category: PreferenceCategory.TRAVEL,
        sentiment: PreferenceSentiment.AVOID,
        topic: '  Topic  ',
        value: '  Value  ',
      }),
    ).toEqual({
      category: PreferenceCategory.TRAVEL,
      sentiment: PreferenceSentiment.AVOID,
      topic: 'Topic',
      value: 'Value',
    });
  });
});
