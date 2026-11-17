import type { CSSProperties } from 'react';
import type { NotificationKind } from '../api/generated/models/NotificationKind';
import {
  isPartnerGestureKind,
  isPartnerNoticeKind,
  type PartnerGestureKind,
  type PartnerNoticeKind,
} from '../client/partnerGestureReceipt';
import { EimirIcon, type EimirIconName } from './EimirIcon';
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
  // A finished recap blooms in like a gentle prompt (#1744).
  RECAP_READY: { icon: 'momente', motion: 'prompt-bloom' },
  RECAP_GREW: { icon: 'momente', motion: 'prompt-bloom' },
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
                '--notification-animation': `notification-${motion}`,
              } as MotionStyle)
            : undefined
        }
      >
        <EimirIcon name={icon} />
      </span>
    </span>
  );
}
