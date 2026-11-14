import {
  type ComponentProps,
  type ReactNode,
  useLayoutEffect,
  useRef,
} from 'react';
import { useTranslation } from '../i18n';
import { EimirIcon, type EimirIconName } from './EimirIcon';
import './PageComposer.css';

function growDescription(field: HTMLTextAreaElement) {
  field.style.height = 'auto';
  field.style.height = `${field.scrollHeight}px`;
}

export function ComposerDescriptionField({
  id,
  rows = 2,
  hint,
  ...props
}: Omit<
  ComponentProps<'textarea'>,
  'id' | 'name' | 'className' | 'onInput' | 'placeholder' | 'ref'
> & {
  id: string;
  /** Warm, domain-specific prompt shown in the empty field; the label stays generic. */
  hint?: string;
}) {
  const { t } = useTranslation();
  const label = t('m5s3.common.description');
  const fieldRef = useRef<HTMLTextAreaElement>(null);
  useLayoutEffect(() => {
    const field = fieldRef.current;
    if (field?.value) growDescription(field);
  }, []);
  return (
    <>
      <label className="sr-only" htmlFor={id}>
        {label}
      </label>
      <textarea
        {...props}
        ref={fieldRef}
        id={id}
        name="description"
        className="page-composer-prose"
        rows={rows}
        placeholder={hint ?? label}
        onInput={(event) => growDescription(event.currentTarget)}
      />
    </>
  );
}

/** Labeled enrichment actions share one keyboard- and safe-area-aware boundary. */
export function ComposerToolRow({ children }: { children: ReactNode }) {
  const { t } = useTranslation();
  const row = useRef<HTMLFieldSetElement>(null);
  useLayoutEffect(() => {
    const element = row.current;
    const page = element?.closest<HTMLElement>('.page-composer');
    if (!element || !page) return;
    const viewport = window.visualViewport;
    const update = () => {
      const inset = viewport
        ? Math.max(0, window.innerHeight - viewport.height - viewport.offsetTop)
        : 0;
      element.style.setProperty('--composer-keyboard-inset', `${inset}px`);
      page.style.setProperty(
        '--composer-tools-height',
        `${element.getBoundingClientRect().height}px`,
      );
      page.style.setProperty(
        '--composer-viewport-top',
        `${viewport?.offsetTop ?? 0}px`,
      );
    };
    const observer =
      typeof ResizeObserver === 'undefined'
        ? undefined
        : new ResizeObserver(update);
    observer?.observe(element);
    viewport?.addEventListener('resize', update);
    viewport?.addEventListener('scroll', update);
    window.addEventListener('resize', update);
    update();
    return () => {
      observer?.disconnect();
      viewport?.removeEventListener('resize', update);
      viewport?.removeEventListener('scroll', update);
      window.removeEventListener('resize', update);
      page.style.removeProperty('--composer-tools-height');
      page.style.removeProperty('--composer-viewport-top');
    };
  }, []);
  return (
    <fieldset
      ref={row}
      aria-label={t('composer.tools')}
      className="composer-tool-row"
    >
      {children}
    </fieldset>
  );
}

export function ComposerTool({
  icon,
  label,
  active = false,
  className = '',
  ...props
}: Omit<ComponentProps<'button'>, 'children'> & {
  icon: EimirIconName;
  label: string;
  active?: boolean;
}) {
  return (
    <button
      type="button"
      {...props}
      className={`composer-tool tertiary ${className}`}
      data-active={active || undefined}
    >
      <EimirIcon name={icon} />
      <span>{label}</span>
    </button>
  );
}

export function ComposerChip({
  icon,
  children,
  className = '',
  ...props
}: ComponentProps<'button'> & { icon: EimirIconName }) {
  return (
    <button
      type="button"
      {...props}
      className={`composer-chip tertiary ${className}`}
    >
      <EimirIcon name={icon} />
      <span>{children}</span>
    </button>
  );
}
