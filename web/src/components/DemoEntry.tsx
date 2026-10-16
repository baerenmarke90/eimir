import { useState } from 'react';
import { loadReferenceClientConfig } from '../client/config';
import { normalizeClientError } from '../client/problemDetails';
import { useTranslation } from '../i18n';
import { Brand } from './Brand';
import { ProblemState } from './ProblemState';

export type DemoPersona = 'LEA' | 'ALEX';

type DemoEntryView = {
  token: string;
};

async function requestDemoEntry(
  apiBaseUrl: string,
  persona: DemoPersona,
): Promise<DemoEntryView> {
  try {
    const response = await fetch(`${apiBaseUrl}/api/v1/demo/entry`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ persona }),
    });
    if (!response.ok) {
      throw { status: response.status };
    }
    return (await response.json()) as DemoEntryView;
  } catch (error) {
    throw await normalizeClientError(error);
  }
}

export function DemoEntry() {
  const { t } = useTranslation();
  const [pending, setPending] = useState<DemoPersona | null>(null);
  const [activeError, setActiveError] = useState<unknown>(null);
  const apiBaseUrl = loadReferenceClientConfig().apiBaseUrl;

  async function join(persona: DemoPersona): Promise<void> {
    setActiveError(null);
    setPending(persona);
    try {
      const result = await requestDemoEntry(apiBaseUrl, persona);
      window.location.assign(
        `/auth/magic-link?token=${encodeURIComponent(result.token)}`,
      );
    } catch (error) {
      setActiveError(error);
      setPending(null);
    }
  }

  return (
    <main className="login-shell">
      <section className="login-intro" aria-labelledby="demo-welcome-heading">
        <Brand />
        <div className="login-intro-content">
          <h1 id="demo-welcome-heading">{t('demo.introHeading')}</h1>
          <p>{t('demo.introBody')}</p>
        </div>
        <div className="entry-illustration" aria-hidden="true">
          <span className="entry-orbit entry-orbit-large" />
          <span className="entry-orbit entry-orbit-small" />
          <span className="entry-illustration-heart">♡</span>
        </div>
      </section>

      <div className="login-panel">
        <section className="login-card" aria-labelledby="demo-entry-heading">
          <div>
            <p className="eyebrow">{t('demo.eyebrow')}</p>
            <h2 id="demo-entry-heading">{t('demo.heading')}</h2>
            <p className="muted">{t('demo.body')}</p>
          </div>

          <div className="form-grid">
            <button
              type="button"
              disabled={pending !== null}
              aria-busy={pending === 'LEA'}
              onClick={() => void join('LEA')}
            >
              {pending === 'LEA' ? t('demo.joining') : t('demo.joinLea')}
            </button>
            <button
              type="button"
              className="secondary"
              disabled={pending !== null}
              aria-busy={pending === 'ALEX'}
              onClick={() => void join('ALEX')}
            >
              {pending === 'ALEX' ? t('demo.joining') : t('demo.joinAlex')}
            </button>
          </div>

          {activeError ? <ProblemState error={activeError} /> : null}
          <p className="login-assurance">{t('demo.assurance')}</p>
        </section>
      </div>
    </main>
  );
}
