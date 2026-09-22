import './ProMark.css';

export function ProMark({ label }: { label: string }) {
  return (
    <span className="pro-mark">
      <svg
        className="pro-mark-crown"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
        focusable="false"
      >
        <path d="M3.5 8.5 8 12l4-6.5 4 6.5 4.5-3.5-1.7 10H5.2z" />
      </svg>
      {label}
    </span>
  );
}
