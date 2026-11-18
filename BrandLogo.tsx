interface BrandLogoProps {
  variant?: 'dark' | 'light';
  size?: 'sm' | 'md' | 'lg';
  suffix?: string;
}

export function BrandLogo({ variant = 'dark', size = 'md', suffix }: BrandLogoProps) {
  const iconSize = size === 'lg' ? 38 : size === 'sm' ? 28 : 32;
  const textClass =
    size === 'lg'
      ? 'text-2xl font-bold tracking-tight'
      : size === 'sm'
        ? 'text-base font-bold tracking-tight'
        : 'text-xl font-bold tracking-tight';

  const colorClass = variant === 'light' ? 'text-white' : 'text-slate-900';

  return (
    <div className="inline-flex items-center gap-2.5 whitespace-nowrap shrink-0 select-none">
      <svg
        width={iconSize}
        height={iconSize}
        viewBox="0 0 40 40"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        aria-hidden="true"
        className="shrink-0"
      >
        <rect
          x="2"
          y="2"
          width="36"
          height="36"
          rx="9"
          fill={variant === 'light' ? '#1D4ED8' : '#1D4ED8'}
        />
        <path
          d="M12 28L17.5 11H22.5L28 28"
          stroke="#FFFFFF"
          strokeWidth="2.4"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path
          d="M20 13V17M20 20.5V24.5"
          stroke="#10B981"
          strokeWidth="2.2"
          strokeLinecap="round"
        />
        <path
          d="M29.5 11.5L32.5 14.5L37 9"
          stroke="#10B981"
          strokeWidth="2.4"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
      <span className={`font-display ${textClass} ${colorClass}`}>
        Pre Examen
        {suffix ? (
          <span
            className={`font-normal ${
              variant === 'light' ? 'text-slate-300' : 'text-slate-500'
            }`}
          >
            {' '}
            · {suffix}
          </span>
        ) : null}
      </span>
    </div>
  );
}
