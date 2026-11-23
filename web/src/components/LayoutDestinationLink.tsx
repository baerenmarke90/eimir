import type { ComponentProps } from 'react';
import { Link } from 'react-router-dom';
import { PRIMARY_APP_ROUTES } from '../client/routes';
import { usePrimaryNavigation } from '../client/usePrimaryNavigation';

/** Personal navigation uses the same fresh root entry as the standard tabs. */
export function LayoutDestinationLink({
  to,
  replace,
  ...props
}: Omit<ComponentProps<typeof Link>, 'to' | 'onClick'> & { to: string }) {
  const { destinationFor, navigatePrimary } = usePrimaryNavigation();
  if (!PRIMARY_APP_ROUTES.some((route) => route.path === to)) {
    return <Link {...props} to={to} replace={replace} />;
  }
  const destination = destinationFor(to);
  return (
    <Link
      {...props}
      {...destination}
      replace={replace ?? destination.replace}
      onClick={(event) => {
        // A destination chosen in the overview replaces the overview entry.
        if (
          replace ||
          event.defaultPrevented ||
          event.button !== 0 ||
          event.altKey ||
          event.ctrlKey ||
          event.metaKey ||
          event.shiftKey
        )
          return;
        event.preventDefault();
        navigatePrimary(to);
      }}
    />
  );
}
