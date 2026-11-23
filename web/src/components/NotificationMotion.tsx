import type { CSSProperties } from 'react';
import type { NotificationKind } from '../api/generated/models/NotificationKind';
import {
  isPartnerGestureKind,
  isPartnerNoticeKind,
  type PartnerGestureKind,
  type PartnerNoticeKind,
} from '../client/partnerGestureReceipt';
import { EimirIcon, type EimirIconName } from './EimirIcon';
import '../motion/moments.css';
import './NotificationMotion.css';

type NotificationMotionSpec = {
  icon: EimirIconName;
  motion: string;
};

/**
 * Plain notification surface for system and owner-only kinds. Gestures and
 * partner-caused notices use the calm receipt badge instead.
 */
const motions: Record<
  Exclude<NotificationKind, PartnerGestureKind | PartnerNoticeKind>,
  NotificationMotionSpec
> = {
  GENTLE_PROMPT: { icon: 'sparkle', motion: 'prompt-bloom' },
  TRANSFER_READY: { icon: 'download', motion: 'download-ready' },
  TRANSFER_COMPLETED: { icon: 'check', motion: 'transfer-done' },
  TRANSFER_FAILED: { icon: 'download', motion: 'transfer-retry' },
  VIDEO_PROCESSING_FAILED: { icon: 'video', motion: 'video-stop' },
  REMINDER_DUE: { icon: 'benachrichtigungen', motion: 'reminder-ring' },
  WISH_REMINDER_DUE: { icon: 'wuensche', motion: 'wish-reminder' },
  // A finished recap rises like a film frame; a newer version settles a
  // second frame onto it (#1744).
  RECAP_READY: { icon: 'momente', motion: 'recap-ready' },
  RECAP_GREW: { icon: 'momente', motion: 'recap-grew' },
  // The operator's reply to a support report settles in calmly, like a note
  // laid down (#2189); reduced motion shows it still.
  SUPPORT_REPLY: { icon: 'benachrichtigungen', motion: 'support-reply' },
};

type MotionStyle = CSSProperties & { '--notification-animation'?: string };

export function NotificationMotion({ kind }: { kind: NotificationKind }) {
  if (isPartnerGestureKind(kind) || isPartnerNoticeKind(kind)) return null;
  const { icon, motion }: NotificationMotionSpec = motions[kind] ?? {
    icon: 'benachrichtigungen',
    motion: '',
  };
  return (
    <span className="notification-motion" data-motion={motion || undefined}>
      <span
        style={
          motion
            ? ({
                '--notification-animation': `eimir-motion-notice-${motion}`,
              } as MotionStyle)
            : undefined
        }
      >
        <EimirIcon name={icon} />
      </span>
    </span>
  );
}
