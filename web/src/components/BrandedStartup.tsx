import { Brand } from './Brand';
import './BrandedStartup.css';

/** Public branding only; restoration never exposes cached relationship content. */
export function BrandedStartup({ label }: { label: string }) {
  return (
    <main className="branded-startup" aria-busy="true">
      <Brand />
      <p role="status">{label}</p>
    </main>
  );
}
