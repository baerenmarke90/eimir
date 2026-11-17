import { type ReactNode, useRef } from 'react';
import type { SharedNoteDetail } from '../api/generated/models/SharedNoteDetail';
import { noteDisplayTitle } from '../client/sharedNotes';
import type { SharedPlanningApis } from '../client/sharedPlanning';
import { useTranslation } from '../i18n';
import { ListEntryIconButton } from './ListEntryActions';
import { NoteChoicePicker } from './NoteChoicePicker';
import { ComposerChip } from './PageComposer';
import './PlanCollectionLinks.css';

/**
 * Shared notes chosen while a Plan is still being created. The Plan does not
 * exist yet, so nothing is linked here: the create page keeps the choice and
 * links it right after the Plan was saved. Starting a new note is not offered,
 * because leaving the page would lose the unsaved Plan.
 */
export function PlanNoteDraftLinks({
  apis,
  spaceId,
  value,
  disabled,
  onChange,
  renderTrigger,
}: {
  apis: Pick<SharedPlanningApis, 'sharedNotes'>;
  spaceId: string;
  value: SharedNoteDetail[];
  disabled: boolean;
  onChange: (notes: SharedNoteDetail[]) => void;
  renderTrigger: (open: () => void) => ReactNode;
}) {
  const { t } = useTranslation();
  const section = useRef<HTMLElement>(null);
  const openChoices = useRef<() => void>(() => {});
  const untitled = t('sharedNotes.untitled');
  return (
    <section
      ref={section}
      tabIndex={-1}
      className="plan-collection-links plan-note-links"
      aria-label={t('sharedNotes.plan.heading')}
    >
      <ul className="composer-selected-chips plan-collection-chips">
        {value.map((note) => {
          const title = noteDisplayTitle(note, untitled);
          return (
            <li key={note.id} className="plan-collection-row">
              <ComposerChip icon="notes" onClick={() => openChoices.current()}>
                {title}
              </ComposerChip>
              <ListEntryIconButton
                icon="unlink"
                className="tertiary"
                label={t('sharedNotes.plan.unlink', { title })}
                disabled={disabled}
                onClick={() => {
                  onChange(value.filter((entry) => entry.id !== note.id));
                  section.current?.focus();
                }}
              />
            </li>
          );
        })}
      </ul>
      <NoteChoicePicker
        apis={apis}
        spaceId={spaceId}
        excludedIds={value.map((note) => note.id)}
        disabled={disabled}
        onChoose={(chosen) => onChange([...value, ...chosen])}
        renderTrigger={(open) => {
          openChoices.current = open;
          return renderTrigger(open);
        }}
      />
    </section>
  );
}
