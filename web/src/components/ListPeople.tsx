import type { ListPerson } from '../client/sharedListSummary';
import { PartnerMarker } from './PartnerMarker';
import './ListPeople.css';

/**
 * The people of a list as two initials discs next to its count (#1808). The
 * discs are decoration: who did what is written out as text beside the bar, so
 * nothing is lost for assistive technology.
 */
export function ListPeople({ people }: { people: readonly ListPerson[] }) {
  if (people.length === 0) return null;
  return (
    <span className="list-people" aria-hidden="true">
      {people.map((person) => (
        <PartnerMarker
          key={person.personId}
          name={person.displayName}
          tone={person.tone}
        />
      ))}
    </span>
  );
}
