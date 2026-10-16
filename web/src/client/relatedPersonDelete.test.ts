import { RelatedPersonDeletePolicy } from '../api/generated/models/RelatedPersonDeletePolicy';
import {
  canConfirmRelatedPersonDelete,
  INITIAL_RELATED_PERSON_DELETE_CHOICE,
  relatedPersonDeleteReducer,
} from './relatedPersonDelete';

describe('RelatedPerson delete confirmation', () => {
  it('has no destructive or non-destructive default', () => {
    expect(INITIAL_RELATED_PERSON_DELETE_CHOICE).toEqual({
      policy: null,
      cascadeConfirmed: false,
    });
    expect(
      canConfirmRelatedPersonDelete(INITIAL_RELATED_PERSON_DELETE_CHOICE),
    ).toBe(false);
  });

  it('allows preserve immediately after an explicit choice', () => {
    const choice = relatedPersonDeleteReducer(
      INITIAL_RELATED_PERSON_DELETE_CHOICE,
      { type: 'select', policy: RelatedPersonDeletePolicy.preserve },
    );

    expect(choice).toEqual({
      policy: RelatedPersonDeletePolicy.preserve,
      cascadeConfirmed: false,
    });
    expect(canConfirmRelatedPersonDelete(choice)).toBe(true);
  });

  it('requires a second explicit confirmation for cascade', () => {
    const cascade = relatedPersonDeleteReducer(
      INITIAL_RELATED_PERSON_DELETE_CHOICE,
      { type: 'select', policy: RelatedPersonDeletePolicy.cascade },
    );
    expect(canConfirmRelatedPersonDelete(cascade)).toBe(false);

    const confirmed = relatedPersonDeleteReducer(cascade, {
      type: 'confirmCascade',
      confirmed: true,
    });
    expect(canConfirmRelatedPersonDelete(confirmed)).toBe(true);
  });

  it('clears cascade confirmation whenever the policy changes', () => {
    const confirmedCascade = {
      policy: RelatedPersonDeletePolicy.cascade,
      cascadeConfirmed: true,
    } as const;

    const preserve = relatedPersonDeleteReducer(confirmedCascade, {
      type: 'select',
      policy: RelatedPersonDeletePolicy.preserve,
    });
    expect(preserve.cascadeConfirmed).toBe(false);
  });
});
