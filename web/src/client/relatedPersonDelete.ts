import { RelatedPersonDeletePolicy } from '../api/generated/models/RelatedPersonDeletePolicy';

export type RelatedPersonDeletePolicyValue =
  (typeof RelatedPersonDeletePolicy)[keyof typeof RelatedPersonDeletePolicy];

export interface RelatedPersonDeleteChoice {
  policy: RelatedPersonDeletePolicyValue | null;
  cascadeConfirmed: boolean;
}

export type RelatedPersonDeleteAction =
  | { type: 'select'; policy: RelatedPersonDeletePolicyValue }
  | { type: 'confirmCascade'; confirmed: boolean };

export const INITIAL_RELATED_PERSON_DELETE_CHOICE: RelatedPersonDeleteChoice = {
  policy: null,
  cascadeConfirmed: false,
};

export function relatedPersonDeleteReducer(
  state: RelatedPersonDeleteChoice,
  action: RelatedPersonDeleteAction,
): RelatedPersonDeleteChoice {
  if (action.type === 'select') {
    return {
      policy: action.policy,
      cascadeConfirmed: false,
    };
  }

  if (state.policy !== RelatedPersonDeletePolicy.cascade) {
    return state;
  }

  return {
    ...state,
    cascadeConfirmed: action.confirmed,
  };
}

export function canConfirmRelatedPersonDelete(
  choice: RelatedPersonDeleteChoice,
): boolean {
  return (
    choice.policy === RelatedPersonDeletePolicy.preserve ||
    (choice.policy === RelatedPersonDeletePolicy.cascade &&
      choice.cascadeConfirmed)
  );
}
