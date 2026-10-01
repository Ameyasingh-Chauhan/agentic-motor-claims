// Simple line illustrations in brand colours (inline SVG, theme-aware via CSS variables).

export function EmptyIllustration({ className }) {
  return (
    <svg viewBox="0 0 144 96" fill="none" className={className} aria-hidden="true">
      <rect x="20" y="18" width="104" height="66" rx="10" fill="var(--bg-muted)" stroke="var(--border-strong)" strokeWidth="1.5" />
      <rect x="32" y="32" width="44" height="6" rx="3" fill="var(--border-strong)" />
      <rect x="32" y="46" width="80" height="6" rx="3" fill="var(--border)" />
      <rect x="32" y="60" width="60" height="6" rx="3" fill="var(--border)" />
      <circle cx="110" cy="24" r="14" fill="var(--blue-50)" stroke="var(--blue-600)" strokeWidth="1.5" />
      <path d="m105 24 3.5 3.5L116 20" stroke="var(--blue-600)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="18" cy="76" r="5" fill="var(--surface)" stroke="var(--orange-500)" strokeWidth="1.5" />
    </svg>
  );
}

export function ErrorIllustration({ className }) {
  return (
    <svg viewBox="0 0 144 96" fill="none" className={className} aria-hidden="true">
      <rect x="20" y="18" width="104" height="66" rx="10" fill="var(--bg-muted)" stroke="var(--border-strong)" strokeWidth="1.5" />
      <path d="M20 30h104" stroke="var(--border-strong)" strokeWidth="1.5" />
      <circle cx="30" cy="24" r="2" fill="var(--border-strong)" />
      <circle cx="37" cy="24" r="2" fill="var(--border-strong)" />
      <path d="M72 42 86 68H58l14-26Z" fill="var(--danger-bg)" stroke="var(--danger)" strokeWidth="1.5" strokeLinejoin="round" />
      <path d="M72 51v8" stroke="var(--danger)" strokeWidth="2" strokeLinecap="round" />
      <circle cx="72" cy="63" r="1.4" fill="var(--danger)" />
    </svg>
  );
}

/** Neutral placeholder for missing images (vehicle silhouette) — never a broken-image icon. */
export function ImagePlaceholder({ className, label = "Image unavailable" }) {
  return (
    <svg viewBox="0 0 160 100" className={className} role="img" aria-label={label} preserveAspectRatio="xMidYMid slice">
      <rect width="160" height="100" fill="var(--bg-muted)" />
      <path
        d="M30 66h100M38 66l8-18c2-4 5-6 9-6h44c4 0 7 2 10 5l14 13c6 0 10 2 10 6"
        fill="none"
        stroke="var(--border-strong)"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="54" cy="68" r="8" fill="var(--surface)" stroke="var(--border-strong)" strokeWidth="2.5" />
      <circle cx="110" cy="68" r="8" fill="var(--surface)" stroke="var(--border-strong)" strokeWidth="2.5" />
    </svg>
  );
}
