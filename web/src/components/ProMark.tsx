import { useHideProFeatureMarks } from '../client/proPresentation';
import { EimirIcon } from './EimirIcon';
import './ProMark.css';

export function ProMark({ label }: { label: string }) {
  const hide = useHideProFeatureMarks();
  if (hide) return null;
  return (
    <span className="pro-mark">
      <EimirIcon name="pro" className="pro-mark-crown" />
      {label}
    </span>
  );
}
