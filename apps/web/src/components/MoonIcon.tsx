interface MoonIconProps {
  size?: number;
  className?: string;
}

export function MoonIcon({ size = 32, className }: MoonIconProps) {
  return (
    <svg className={className} width={size} height={size} viewBox="0 0 64 64" fill="none" aria-hidden="true">
      <path
        d="M45.7 43.2A22 22 0 0 1 24.3 10.4 22 22 0 1 0 53.6 39.7a22 22 0 0 1-7.9 3.5Z"
        fill="currentColor"
      />
    </svg>
  );
}
