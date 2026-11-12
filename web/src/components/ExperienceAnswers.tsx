import type { ExperienceAnswer } from '../api/generated/models/ExperienceAnswer';
import type { ExperienceKind } from '../api/generated/models/ExperienceKind';
import { authorDisplayName } from '../client/authorPresentation';
import { usePartnerNickname } from '../client/partnerNickname';
import { memoryEditPath } from '../client/routes';
import { useTranslation } from '../i18n';
import { EimirIcon } from './EimirIcon';
import { personInitials } from './PersonIdentity';
import { StoryDetailEditLink } from './StoryDetailEditLink';
import './ExperienceAnswers.css';

export function ExperienceAnswers({
  answers,
  kind,
  compact = false,
  showLabel = true,
  editable = false,
  originKey,
  preview = false,
  viewerId,
}: {
  answers: readonly ExperienceAnswer[];
  kind: ExperienceKind;
  compact?: boolean;
  showLabel?: boolean;
  editable?: boolean;
  originKey?: string;
  /** Overview rows: one surface per entry, author once, short clamped words. */
  preview?: boolean;
  /** Lets a preview tell the reader's own words from the partner's. */
  viewerId?: string;
}) {
  const { t } = useTranslation();
  const { nicknameFor } = usePartnerNickname();
  const nameOf = (answer: ExperienceAnswer) =>
    answer.author.isFormerMember
      ? authorDisplayName(answer.author)
      : nicknameFor(answer.author.id) || answer.author.displayName;
  if (preview) {
    return (
      <ul className="experience-answers experience-answers-preview">
        {answers.map((answer) => (
          <li
            key={answer.id}
            className="experience-answer-preview"
            data-own={answer.author.id === viewerId || undefined}
          >
            <span className="experience-answer-avatar" aria-hidden="true">
              {personInitials(nameOf(answer))}
            </span>
            <span className="experience-answer-preview-words">
              <strong>{nameOf(answer)}</strong>
              <span>{answer.body}</span>
            </span>
          </li>
        ))}
      </ul>
    );
  }
  return (
    <div
      className={`experience-answers${compact ? ' experience-answers-compact' : ''}`}
    >
      {showLabel ? (
        <span className="experience-shared-label">
          <EimirIcon name={kind === 'HAPPINESS' ? 'highlights' : 'kapitel'} />
          {t(
            kind === 'HAPPINESS'
              ? 'coupleExperiences.sharedHappiness'
              : 'coupleExperiences.sharedTimeTravel',
          )}
        </span>
      ) : null}
      {answers.map((answer, index) => (
        <div
          key={answer.id}
          className="experience-answer"
          data-answer-tone={index % 2}
        >
          <div className="experience-answer-author">
            <strong>{nameOf(answer)}</strong>
            {editable && answer.capabilities.canEdit ? (
              <StoryDetailEditLink
                to={memoryEditPath(answer.id)}
                label={t('coupleExperiences.editOwnAnswer')}
                state={{ taskOriginKey: originKey }}
              />
            ) : null}
          </div>
          <p>{answer.body}</p>
        </div>
      ))}
    </div>
  );
}
