import { InstanceApi } from '../api/generated/apis/InstanceApi';
import type { AuthCapabilities } from '../api/generated/models/AuthCapabilities';
import type { OidcConnectionView } from '../api/generated/models/OidcConnectionView';
import type {
  InstanceAccessStatus,
  InstanceAccessStatusAccountCreationEnum,
} from '../api/generated/models/InstanceAccessStatus';
import { Configuration } from './apiConfiguration';

export type RegistrationAvailability =
  | 'available'
  | 'administrator'
  | 'maintenance'
  | 'unreachable';

export function classifyRegistrationAvailability(
  status: InstanceAccessStatus,
): RegistrationAvailability {
  if (
    status.maintenanceMode ||
    status.registrationUnavailableReason === 'maintenance'
  ) {
    return 'maintenance';
  }
  if (status.registrationAvailable) return 'available';
  if (status.registrationUnavailableReason === 'administrator') {
    return 'administrator';
  }
  return 'unreachable';
}

export interface InstanceStatusResult {
  availability: RegistrationAvailability;
  auth: AuthCapabilities | null;
  accountCreation: InstanceAccessStatusAccountCreationEnum;
  selfServiceSignupAvailable: boolean;
  maintenanceMode: boolean;
  registrationAvailable: boolean;
  /** Terms version a new Account must accept here; null where none applies. */
  termsOfUseVersion: string | null;
  /** External sign-in providers configured on this instance. */
  oidcConnections?: OidcConnectionView[];
  /** A person may create a new Account through a provider right now. */
  oidcSignupAvailable?: boolean;
  /** The operator accepts support reports (#2189); false while unknown. */
  supportReportsAvailable?: boolean;
  /** A Space member can redeem an eimir. gift code here; false while unknown. */
  giftCodesAvailable?: boolean;
}

export function isSelfServiceSignupAllowed(
  status: InstanceStatusResult,
): boolean {
  return status.selfServiceSignupAvailable;
}

export function isInvitationOnly(status: InstanceStatusResult): boolean {
  return status.accountCreation === 'invitation';
}

export async function loadInstanceAccessStatus(
  apiBaseUrl: string,
  loadStatus?: () => Promise<InstanceAccessStatus>,
): Promise<InstanceStatusResult> {
  try {
    const operation =
      loadStatus ??
      (() =>
        new InstanceApi(
          new Configuration({ basePath: apiBaseUrl }),
        ).instanceStatusApiV1InstanceStatusGet());
    const status = await operation();
    return {
      availability: classifyRegistrationAvailability(status),
      auth: status.auth ?? null,
      accountCreation: status.accountCreation ?? 'invitation',
      selfServiceSignupAvailable: Boolean(status.selfServiceSignupAvailable),
      maintenanceMode: status.maintenanceMode,
      registrationAvailable: status.registrationAvailable,
      termsOfUseVersion: status.termsOfUseVersion ?? null,
      oidcConnections: status.oidcConnections ?? [],
      oidcSignupAvailable: Boolean(status.oidcSignupAvailable),
      supportReportsAvailable: status.supportReportsAvailable === true,
      giftCodesAvailable: status.giftCodesAvailable === true,
    };
  } catch {
    return {
      availability: 'unreachable',
      auth: null,
      accountCreation: 'invitation',
      selfServiceSignupAvailable: false,
      maintenanceMode: false,
      registrationAvailable: false,
      termsOfUseVersion: null,
      oidcConnections: [],
      oidcSignupAvailable: false,
      supportReportsAvailable: false,
      giftCodesAvailable: false,
    };
  }
}

export async function loadRegistrationAvailability(
  apiBaseUrl: string,
  loadStatus?: () => Promise<InstanceAccessStatus>,
): Promise<RegistrationAvailability> {
  return (await loadInstanceAccessStatus(apiBaseUrl, loadStatus)).availability;
}
