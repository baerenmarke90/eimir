import { createContext, useId } from 'react';
import { Link, type LinkProps, useLocation } from 'react-router-dom';
import './PreviewCardLink.css';

export const PreviewCardLocationContext = createContext('');

/** Whole-card navigation with independent media controls, never inside a link. */
export function PreviewCardLink({
  children,
  className = '',
  ...props
}: LinkProps) {
  const contentId = useId();
  const location = useLocation();
  return (
    <PreviewCardLocationContext.Provider value={location.key}>
      <div className={`${className} preview-card-link`}>
        <Link
          {...props}
          className="preview-card-link-target"
          aria-labelledby={props['aria-label'] ? undefined : contentId}
        />
        <div id={contentId} className="preview-card-link-content">
          {children}
        </div>
      </div>
    </PreviewCardLocationContext.Provider>
  );
}
