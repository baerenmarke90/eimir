import type { PluginListenerHandle } from '@capacitor/core';
import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  hasNativeVideoTransfers,
  nativeVideoTransfers,
  type VideoTransferOpen,
  type VideoTransferOwner,
} from './backgroundVideoUploads';
import { heartMomentDetailPath, memoryDetailPath } from './routes';
import { postSnackbar } from './snackbar';
import {
  isDocumentLeaveBlocked,
  useDocumentLeaveBlocked,
} from './useDocumentLeaveGuard';

const uuid = /^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/i;

/** Native hints select a canonical detail; normal authenticated reads own access. */
export function useVideoTransferNavigation(owner: VideoTransferOwner) {
  const navigate = useNavigate();
  const blocked = useDocumentLeaveBlocked();
  const scope = JSON.stringify(owner);
  const currentScope = useRef(scope);
  currentScope.current = scope;
  const [pending, setPending] = useState<{
    scope: string;
    path: string;
  } | null>(null);
  const { instance, accountId, spaceId } = owner;
  useEffect(() => {
    if (!hasNativeVideoTransfers()) return;
    let active = true;
    let listener: PluginListenerHandle | undefined;
    const receive = (event: VideoTransferOpen) => {
      if (
        !active ||
        currentScope.current !== scope ||
        event.instance !== instance ||
        event.accountId !== accountId ||
        event.spaceId !== spaceId ||
        !uuid.test(event.attachmentId) ||
        !uuid.test(event.targetId)
      )
        return;
      const path =
        event.targetType === 'MEMORY'
          ? memoryDetailPath(event.targetId)
          : event.targetType === 'HEART_MOMENT'
            ? heartMomentDetailPath(event.targetId)
            : null;
      if (!path) return;
      setPending({ scope, path });
      if (isDocumentLeaveBlocked())
        postSnackbar('snackbar.notificationWaiting');
    };
    void nativeVideoTransfers
      .addListener('transferOpen', receive)
      .then((handle) => {
        if (active) listener = handle;
        else void handle.remove();
      })
      .catch(() => undefined);
    return () => {
      active = false;
      void listener?.remove();
    };
  }, [instance, accountId, spaceId, scope]);
  useEffect(() => {
    if (!pending) return;
    if (pending.scope !== scope) {
      setPending(null);
      return;
    }
    if (blocked) return;
    setPending(null);
    navigate(pending.path);
  }, [blocked, pending, scope, navigate]);
}
