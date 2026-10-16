import { onlineManager } from '@tanstack/react-query';
import { ClientProblemError } from './problemDetails';

/** Both client signals must permit a deliberate write; API errors remain authoritative. */
export function isClientOnline(): boolean {
  return onlineManager.isOnline() && navigator.onLine !== false;
}

/** Call at dispatch, after any awaited admission/cancellation work. */
export function assertOnlineWrite(): void {
  if (!isClientOnline()) throw new ClientProblemError('offline');
}
