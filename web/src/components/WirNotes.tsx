import type { MouseEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import type { SharedNoteDetail } from '../api/generated/models/SharedNoteDetail';
import { authorFirstName } from '../client/authorPresentation';
import { formatRelativeTime } from '../client/formatRecency';
import { personRoleResolver } from '../client/personColours';
import {
  MORE_NOTES_ROUTE,
  sharedNoteDetailPath,
  sharedNoteEditPath,
} from '../client/routes';
import { noteDisplayTitle, noteExcerpt } from '../client/sharedNotes';
import { useTaskOrigin } from '../client/taskOrigin';
import { useTranslation } from '../i18n';
import { AddActionLink } from './AddAction';
import { EimirIcon } from './EimirIcon';
import './WirLists.css';
import './WirNotes.css';

function plainActivation(event: MouseEvent): boolean {
  return !(
    event.button !== 0 ||
    event.metaKey ||
    event.ctrlKey ||
    event.shiftKey ||
    event.altKey
  );
}

/**
 * The tiles of "Unsere Notiz(en)" on Wir (#1969): the pinned notes, at most
 * five. One note is one wide tile with its add action inside; several are tiles
 * in a swipeable row with the same anatomy as the lists row and no per-tile
 * action. A quiet last tile leads on to the overview when more are pinned. The
 * section around it (title and the link to all notes) belongs to the Wir page.
 */
export function WirNotes({
  notes,
  hasMore,
  accountId,
}: {
  notes: readonly SharedNoteDetail[];
  hasMore: boolean;
  accountId: string;
}) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { captureOrigin } = useTaskOrigin();
  const roleOf = personRoleResolver(accountId);

  if (notes.length === 0) return null;

  function go(event: MouseEvent<HTMLAnchorElement>, to: string) {
    if (!plainActivation(event)) return;
    event.preventDefault();
    void navigate(to, { state: { taskOriginKey: captureOrigin() } });
  }

  const wide = notes.length === 1;
  return (
    <ul className={wide ? 'wir-lists-single' : 'wir-lists-row'}>
      {notes.map((note) => {
        // "Title only" keeps the text off Wir. A note without a title is
        // normally named by its first line, which would show that text.
        const title =
          note.wirTitleOnly && !note.title.trim()
            ? t('sharedNotes.untitled')
            : noteDisplayTitle(note, t('sharedNotes.untitled'));
        const excerpt = noteExcerpt(note);
        const person = note.editor ?? note.creator;
        const own = roleOf(person.id) === 'own';
        const when = formatRelativeTime(note.editedAt, t);
        return (
          <li key={note.id} className="wir-list-tile wir-note-tile">
            <Link
              to={sharedNoteDetailPath(note.id)}
              className="wir-list-tile-main"
              aria-label={t('sharedNotes.wir.open', { title })}
              onClick={(event) => go(event, sharedNoteDetailPath(note.id))}
            >
              <h3 id={`wir-note-${note.id}`} className="wir-list-tile-title">
                {title}
              </h3>
              {note.wirTitleOnly ? (
                <p className="wir-note-hidden">
                  <EimirIcon name="eye-off" />
                  {t('sharedNotes.wir.hiddenExcerpt')}
                </p>
              ) : excerpt ? (
                <p className="wir-note-excerpt">{excerpt}</p>
              ) : null}
              <p className="wir-list-tile-last">
                {own
                  ? t('sharedNotes.editedByYou', { when })
                  : t('sharedNotes.editedBy', {
                      name: authorFirstName(person),
                      when,
                    })}
              </p>
            </Link>
            {wide && note.capabilities.canEdit ? (
              <AddActionLink
                to={sharedNoteEditPath(note.id)}
                className="wir-list-tile-add"
                label={t('sharedNotes.wir.add')}
                icon="pen"
                aria-describedby={`wir-note-${note.id}`}
                onClick={(event) => go(event, sharedNoteEditPath(note.id))}
              />
            ) : null}
          </li>
        );
      })}
      {hasMore ? (
        <li className="wir-list-tile wir-note-tile wir-note-more">
          <Link
            to={MORE_NOTES_ROUTE}
            className="wir-list-tile-main"
            onClick={(event) => go(event, MORE_NOTES_ROUTE)}
          >
            <span className="wir-note-more-label">
              {t('sharedNotes.wir.allNotes')}
            </span>
          </Link>
        </li>
      ) : null}
    </ul>
  );
}
