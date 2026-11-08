import type { ComponentProps } from 'react';
import { Link } from 'react-router-dom';
import { AddIcon } from './DestinationIcon';
import './AddAction.css';

/** One product-sized add affordance; the consumer owns its action and name. */
export function AddActionButton({
  label,
  className = '',
  ...props
}: Omit<ComponentProps<'button'>, 'children'> & {
  label: string;
}) {
  return (
    <button
      type="button"
      {...props}
      className={`add-action ${className}`}
      aria-label={label}
      title={label}
    >
      <AddIcon />
    </button>
  );
}

/** Keep navigation, modified clicks, state and focus as native link behavior. */
export function AddActionLink({
  label,
  ...props
}: Omit<ComponentProps<typeof Link>, 'children' | 'className'> & {
  label: string;
}) {
  return (
    <Link
      {...props}
      className="button-link add-action"
      aria-label={label}
      title={label}
    >
      <AddIcon />
    </Link>
  );
}
