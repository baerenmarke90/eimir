import { Link } from 'react-router-dom';

export const PRODUCT_NAME = 'eimir.';

type BrandProps = {
  to?: string;
  ariaLabel?: string;
  inverse?: boolean;
};

function BrandMark() {
  return (
    <span className="brand-mark" aria-hidden="true">
      <img
        className="brand-logo-light"
        src="/identity/app-icon-light.svg"
        alt=""
        width="32"
        height="32"
      />
      <img
        className="brand-logo-dark"
        src="/identity/app-icon-dark.svg"
        alt=""
        width="32"
        height="32"
      />
    </span>
  );
}

function BrandContent() {
  return (
    <>
      <BrandMark />
      <span className="brand-name">
        <strong>
          eimir<span className="brand-dot">.</span>
        </strong>
      </span>
    </>
  );
}

export function Brand({ to, ariaLabel, inverse = false }: BrandProps) {
  const className = `brand${inverse ? ' brand-inverse' : ''}`;

  if (to) {
    return (
      <Link className={className} to={to} aria-label={ariaLabel}>
        <BrandContent />
      </Link>
    );
  }

  return (
    <div className={`${className} brand-static`}>
      <BrandContent />
    </div>
  );
}
