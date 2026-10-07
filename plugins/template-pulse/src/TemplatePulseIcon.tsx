import type { SVGProps } from 'react';

/** The Template Pulse mark, inheriting its host's text color. @public */
export function TemplatePulseIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      width="24"
      height="24"
      viewBox="0 0 64 64"
      fill="none"
      aria-hidden="true"
      focusable="false"
      {...props}
    >
      <path
        d="M38 12H22a4 4 0 0 0-4 4v32a4 4 0 0 0 4 4h22a4 4 0 0 0 4-4V22L38 12Z M38 12v10h10"
        stroke="currentColor"
        strokeWidth="3.5"
        strokeLinejoin="round"
        opacity="0.55"
      />
      <path
        d="M9 36h14l6-12 7 24 6-12h13"
        stroke="currentColor"
        strokeWidth="4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
