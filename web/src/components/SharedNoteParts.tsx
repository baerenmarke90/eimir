import type { ReactNode } from 'react';
import type { SharedNoteDetail } from '../api/generated/models/SharedNoteDetail';
import { authorFirstName } from '../client/authorPresentation';
import { authoredLinks } from '../client/authoredLinks';
import { formatRelativeTime } from '../client/formatRecency';
import { personRoleResolver } from '../client/personColours';
import { parseNoteBlocks } from '../client/sharedNotes';
import { useTranslation } from '../i18n';
import { PartnerMarker } from './PartnerMarker';
import './SharedNotes.css';

/** Plain text stays inert: only recognised web links become anchors. */
function Linkified({ text }: { text: string }) {
  const { t } = useTranslation();
  const parts: ReactNode[] = [];
  let offset = 0;
  for (const link of authoredLinks(text)) {
    parts.push(text.slice(offset, link.start));
    parts.push(
      <a
        key={link.start}
        href={link.url}
        target="_blank"
        rel="noopener noreferrer external"
      >
        {text.slice(link.start, link.end)}
        <span className="sr-only">{t('authoredLinks.external')}</span>
      </a>,
    );
    offset = link.end;
  }
  parts.push(text.slice(offset));
  return <>{parts}</>;
}

/** The reading rendering of a note: paragraphs and bullet lists, nothing else. */
export function NoteBody({ body }: { body: string }) {
  return (
    <div className="shared-note-body">
      {parseNoteBlocks(body).map((block, index) =>
        block.kind === 'paragraph' ? (
          // The body is positional text; there is no stable id per line.
          // biome-ignore lint/suspicious/noArrayIndexKey: static render of parsed text
          <p key={index}>
            <Linkified text={block.text} />
          </p>
        ) : (
          // biome-ignore lint/suspicious/noArrayIndexKey: static render of parsed text
          <ul key={index}>
            {block.items.map((item, itemIndex) => (
              // biome-ignore lint/suspicious/noArrayIndexKey: static render of parsed text
              <li key={itemIndex}>
                <Linkified text={item} />
              </li>
            ))}
          </ul>
        ),
      )}
    </div>
  );
}

/** Who changed the note last and when, with the person's own colour. */
export function NoteEditorLine({
  note,
  accountId,
  variant = 'edited',
}: {
  note: Pick<SharedNoteDetail, 'creator' | 'editor' | 'editedAt'>;
  accountId: string;
  variant?: 'edited' | 'changed';
}) {
  const { t } = useTranslation();
  const person = note.editor ?? note.creator;
  const role = personRoleResolver(accountId)(person.id);
  const when = formatRelativeTime(note.editedAt, t);
  const own = role === 'own';
  // Your own edits are quiet: only when. The name and marker appear when the
  // partner changed the note, so what is new from them stands out.
  return (
    <p className="shared-note-meta">
      {own ? null : <PartnerMarker name={person.displayName} role={role} />}
      <span>
        {own
          ? variant === 'edited'
            ? when
            : t('sharedNotes.changedAt', { when })
          : t(
              variant === 'edited'
                ? 'sharedNotes.editedBy'
                : 'sharedNotes.changedBy',
              { name: authorFirstName(person), when },
            )}
      </span>
    </p>
  );
}

/**
 * Who wrote the note matters only once someone else changed it; while the
 * author is also the last editor the editor line already says everything.
 */
export function NoteCreatorLine({
  note,
  accountId,
}: {
  note: Pick<SharedNoteDetail, 'creator' | 'editor'>;
  accountId: string;
}) {
  const { t } = useTranslation();
  if (!note.editor || note.editor.id === note.creator.id) return null;
  const role = personRoleResolver(accountId)(note.creator.id);
  return (
    <p className="shared-note-meta">
      {role === 'own' ? null : (
        <PartnerMarker name={note.creator.displayName} role={role} />
      )}
      <span>
        {role === 'own'
          ? t('sharedNotes.writtenByYou')
          : t('sharedNotes.writtenBy', {
              name: authorFirstName(note.creator),
            })}
      </span>
    </p>
  );
}
