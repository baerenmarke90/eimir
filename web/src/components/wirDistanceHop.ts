/**
 * The light hop on the Wir hero (Motion Contract 4.4, 4.9): one small light
 * leaves each portrait and hops to the heart. The farther apart the two are,
 * the higher and slower the hop. Decoration only, in the shared flight layer;
 * without a flight (reduced motion, no support) the caller shows the result.
 */
import {
  animateFlight,
  flightEnded,
  flightKeyframes,
  openFlightLayer,
  type Point,
} from '../motion/flight';
import { easing } from '../motion/tokens';

/** The lead light and the two that trail it, per side. */
const SPARKS = 3;
const SPARK_SIZE_PX = 7;
/** The share of the hop over which a light appears and goes out. */
const SPARK_FADE = 0.15;
const TRAIL_OPACITY = 0.4;

/**
 * A light appears as it leaves and goes out as it lands. It holds that end
 * state until the layer is removed, so it never returns to its start on the
 * portrait while the lights behind it are still flying.
 */
function withSparkFade(frames: Keyframe[], peak: number): Keyframe[] {
  const last = frames.length - 1;
  return frames.map((frame, index) => {
    const progress = last > 0 ? index / last : 1;
    const edge = Math.min(progress, 1 - progress) / SPARK_FADE;
    return { ...frame, opacity: peak * Math.min(1, edge) };
  });
}

export interface DistanceHop {
  /** When the two lead lights reach the heart. */
  arrived: Promise<void>;
  /** The time until then, in ms. */
  duration: number;
  cancel: () => void;
}

/** `closeness` runs from 0 (together) to 1 (far apart). */
export function playDistanceHop(
  stage: Element,
  closeness: number,
): DistanceHop | null {
  const portraits = stage.querySelectorAll('.today-hero .partner-avatar');
  const heart = stage.querySelector('.wir-bridge-line svg');
  if (portraits.length < 2 || !heart) return null;
  const flight = openFlightLayer();
  if (!flight) return null;

  const own = portraits[0].getBoundingClientRect();
  const partner = portraits[1].getBoundingClientRect();
  const target = heart.getBoundingClientRect();
  const y = target.top + target.height / 2;
  const x = target.left + target.width / 2;
  const duration = flight.roles.flight * (0.75 + 0.75 * closeness);
  const rise = 14 + 24 * closeness;
  const colours = getComputedStyle(stage);
  const sides = [
    {
      name: 'own',
      from: { x: own.right, y: own.top + own.height / 2 },
      to: { x: x - 5, y },
      colour: colours.getPropertyValue('--wir-own-accent'),
    },
    {
      name: 'partner',
      from: { x: partner.left, y: partner.top + partner.height / 2 },
      to: { x: x + 5, y },
      colour: colours.getPropertyValue('--wir-partner-accent'),
    },
  ];

  const place = (point: Point, colour: string, index: number) => {
    const spark = document.createElement('span');
    spark.className = `wir-distance-spark${index > 0 ? ' is-trail' : ''}`;
    spark.style.left = `${point.x - SPARK_SIZE_PX / 2}px`;
    spark.style.top = `${point.y - SPARK_SIZE_PX / 2}px`;
    spark.style.setProperty('--wir-distance-spark', colour);
    flight.layer.append(spark);
    return spark;
  };

  const lead: Array<Animation | null> = [];
  const all: Array<Animation | null> = [];
  for (const side of sides) {
    for (let index = 0; index < SPARKS; index += 1) {
      const animation = animateFlight(
        place(side.from, side.colour, index),
        withSparkFade(
          flightKeyframes(
            side.from,
            side.to,
            1,
            index > 0 ? 0.4 : 0.7,
            0,
            rise,
          ),
          index > 0 ? TRAIL_OPACITY : 1,
        ),
        {
          duration,
          delay: index * flight.roles.stagger,
          easing: easing('standard'),
          fill: 'both',
        },
      );
      all.push(animation);
      if (index === 0) lead.push(animation);
    }
  }
  let disposed = false;
  const dispose = () => {
    if (disposed) return;
    disposed = true;
    flight.dispose();
  };
  void Promise.all(all.map(flightEnded)).then(dispose);
  return {
    arrived: Promise.all(lead.map(flightEnded)).then(() => undefined),
    duration,
    cancel: () => {
      for (const animation of all) animation?.cancel();
      dispose();
    },
  };
}
