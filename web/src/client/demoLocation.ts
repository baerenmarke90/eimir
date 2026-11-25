import type {
  ApproximatePosition,
  LocationPermission,
} from './approximateLocation';

/**
 * Example positions for the public Demo (Lea and Alex).
 *
 * They mirror the two positions the Demo seed publishes in the backend
 * (`demo/feature_examples.py`: Cologne and Duesseldorf). A Demo visitor never
 * shares a device position and Wir never opens the OS location dialog, so
 * without these the Wir heart and the map would stay empty. The values are
 * fictional and never leave the Demo.
 */
const LEA_EXAMPLE_POSITION = { latitude: 50.9375, longitude: 6.9603 };
const ALEX_EXAMPLE_POSITION = { latitude: 51.2277, longitude: 6.7735 };
const EXAMPLE_ACCURACY_METERS = 25;

/**
 * What the Wir distance line reads in the Demo: a granted permission and an
 * example fix. A Demo deployment ignores the position in the request and uses
 * the seeded one, so this value only has to be valid.
 */
export const demoDistanceInputs = {
  permission: async (): Promise<LocationPermission> => 'granted',
  measure: async (): Promise<ApproximatePosition> => ({
    ...LEA_EXAMPLE_POSITION,
    accuracyMeters: EXAMPLE_ACCURACY_METERS,
    capturedAt: new Date(),
  }),
};

function squaredGap(
  a: { latitude: number; longitude: number },
  b: { latitude: number; longitude: number },
): number {
  return (a.latitude - b.latitude) ** 2 + (a.longitude - b.longitude) ** 2;
}

/**
 * The viewer's own example position on the Demo map. The partner's area is
 * the other persona's example position, so the viewer is the persona whose
 * example position lies farther from it.
 */
export function demoOwnPosition(
  partnerArea:
    | { latitude?: number | null; longitude?: number | null }
    | null
    | undefined,
): ApproximatePosition | null {
  if (partnerArea?.latitude == null || partnerArea.longitude == null)
    return null;
  const partner = {
    latitude: partnerArea.latitude,
    longitude: partnerArea.longitude,
  };
  const partnerIsAlex =
    squaredGap(partner, ALEX_EXAMPLE_POSITION) <
    squaredGap(partner, LEA_EXAMPLE_POSITION);
  return {
    ...(partnerIsAlex ? LEA_EXAMPLE_POSITION : ALEX_EXAMPLE_POSITION),
    accuracyMeters: EXAMPLE_ACCURACY_METERS,
    capturedAt: new Date(),
  };
}
