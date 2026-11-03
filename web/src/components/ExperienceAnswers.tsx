import type { ExperienceAnswer } from '../api/generated/models/ExperienceAnswer';
import type { ExperienceKind } from '../api/generated/models/ExperienceKind';
import { authorDisplayName } from '../client/authorPresentation';
import { usePartnerNickname } from '../client/partnerNickname';
import { memoryEditPath } from '../client/routes';
import { useTranslation } from '../i18n';
import { EimirIcon } from './EimirIcon';
import { StoryDetailEditLink } from './StoryDetailEditLink';
import './ExperienceAnswers.css';

export function ExperienceAnswers({
  answers,
  kind,
  compact = false,
  editable = false,
  originKey,
}: {
  answers: readonly ExperienceAnswer[];
  kind: ExperienceKind;
  compact?: boolean;
  editable?: boolean;
  originKey?: string;
}) {
  const { t } = useTranslation();
  const { nicknameFor } = usePartnerNickname();
  return (
    <div
      className={`experience-answers${compact ? ' experience-answers-compact' : ''}`}
    >
      <span className="experience-shared-label">
        <EimirIcon name={kind === 'HAPPINESS' ? 'highlights' : 'kapitel'} />
        {t(
          kind === 'HAPPINESS'
            ? 'coupleExperiences.sharedHappiness'
            : 'coupleExperiences.sharedTimeTravel',
        )}
      </span>
      {answers.map((answer, index) => (
        <div
          key={answer.id}
          className="experience-answer"
          data-answer-tone={index % 2}
        >
          <div className="experience-answer-author">
            <strong>
              {answer.author.isFormerMember
                ? authorDisplayName(answer.author)
                : nicknameFor(answer.author.id) || answer.author.displayName}
            </strong>
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
