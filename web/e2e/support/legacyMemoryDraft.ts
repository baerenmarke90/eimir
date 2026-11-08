import { type Dialog, expect, type Page } from '@playwright/test';
import de from '../../src/i18n/locales/de';
import taskBoundary from '../../src/i18n/locales/taskBoundary';

/** Seed an actual pre-atomic persisted attempt; new captures never enter this path. */
export async function resumeLegacyMemoryAttempt(page: Page) {
  await expect
    .poll(async () =>
      [de.memory.diary.draft.saved, de.memory.diary.draft.memoryOnly].includes(
        await page.locator('.memory-draft-status').innerText(),
      ),
    )
    .toBe(true);
  await page.evaluate(
    () =>
      new Promise<void>((resolve, reject) => {
        const open = indexedDB.open('eimir-memory-drafts-v1');
        open.onerror = () => reject(open.error);
        open.onsuccess = () => {
          const db = open.result;
          const tx = db.transaction('drafts', 'readwrite');
          const store = tx.objectStore('drafts');
          const cursor = store.openCursor();
          let seeded = false;
          cursor.onsuccess = () => {
            const entry = cursor.result;
            if (!entry) return;
            const record = entry.value,
              value = record.value;
            if (value.files.length) {
              value.attempt = {
                idempotencyKey: crypto.randomUUID(),
                startedAt: Date.now(),
                snapshot: {
                  title: value.title || 'Recovered diary entry',
                  body: value.body,
                  tags: value.tags,
                  happenedOn: value.happenedOn
                    ? new Date(`${value.happenedOn}T00:00:00Z`)
                    : null,
                  happenedUntil: value.happenedUntil
                    ? new Date(`${value.happenedUntil}T00:00:00Z`)
                    : null,
                  placeIds: (value.places ?? []).map(
                    (place: { id: string }) => place.id,
                  ),
                },
                attachmentIds: value.files.map(
                  (file: { attachmentId: string }) => file.attachmentId,
                ),
                attachmentSensitivity: value.files.map(
                  (file: { isSensitive?: boolean }) =>
                    file.isSensitive === true,
                ),
                selectedCoverPosition: value.selectedCoverPosition ?? null,
              };
              entry.update(record);
              seeded = true;
            }
            entry.continue();
          };
          tx.oncomplete = () => {
            db.close();
            if (seeded) resolve();
            else reject(new Error('No persisted legacy capture fixture'));
          };
          tx.onabort = tx.onerror = () => {
            db.close();
            reject(tx.error);
          };
        };
      }),
  );
  const accept = (dialog: Dialog) => {
    void dialog.accept();
  };
  if (!page.listenerCount('dialog')) page.once('dialog', accept);
  await page.reload();
  page.off('dialog', accept);
  await page
    .getByRole('button', { name: de.memory.diary.resume, exact: true })
    .click();
  await expect(
    page.getByRole('heading', { name: taskBoundary.uncertainTitle }),
  ).toBeVisible();
}
