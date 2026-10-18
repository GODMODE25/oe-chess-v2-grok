type PieceProps = { type: string; color: "w" | "b"; className?: string };

export function PieceGlyph({ type, color, className }: PieceProps) {
  const fill = color === "w" ? "var(--color-ivory)" : "var(--color-ink)";
  const stroke = color === "w" ? "var(--color-walnut)" : "var(--color-brass-2)";
  const common = { fill, stroke, strokeWidth: 1.5, strokeLinejoin: "round" as const };
  return (
    <svg viewBox="0 0 45 45" className={className} aria-hidden="true">
      {type === "p" && (
        <>
          <circle cx="22.5" cy="14" r="5.5" {...common} />
          <path d="M16 36c1.2-7 4-9 6.5-9s5.3 2 6.5 9" {...common} />
          <rect x="14" y="35" width="17" height="4" rx="1.2" {...common} />
        </>
      )}
      {type === "r" && <path d="M13 38h19v-3.5H13zM15 34.5h15l-1.6-12H16.6zM13 22.5h4.2V17H21v5.5h3V17h3.8v5.5H32v-7H13z" {...common} />}
      {type === "n" && (
        <path
          d="M14 38h16l-2-8 4-3-1-6 4 1-3-7-5 3-2-5-4 4c-4 2-6 6-5 11l-3 3 1 7z"
          {...common}
        />
      )}
      {type === "b" && (
        <>
          <circle cx="22.5" cy="11" r="3.2" {...common} />
          <path d="M22.5 15c-6 3-8 10-7 16h14c1-6-1-13-7-16z" {...common} />
          <path d="M22.5 9v8" fill="none" stroke={stroke} strokeWidth="1.6" />
          <rect x="14" y="35" width="17" height="4" rx="1.2" {...common} />
        </>
      )}
      {type === "q" && (
        <>
          <circle cx="12" cy="12" r="2.4" {...common} />
          <circle cx="22.5" cy="8" r="2.4" {...common} />
          <circle cx="33" cy="12" r="2.4" {...common} />
          <path d="M12 14l4 16h13l4-16-7 6-3.5-7z" {...common} />
          <rect x="14" y="35" width="17" height="4" rx="1.2" {...common} />
        </>
      )}
      {type === "k" && (
        <>
          <path d="M20 5h5v4h4v4h-4v3h-5v-3h-4V9h4z" {...common} />
          <path d="M16 20c1 8 2 12 6.5 14 4.5-2 5.5-6 6.5-14-3 2-10 2-13 0z" {...common} />
          <rect x="14" y="35" width="17" height="4" rx="1.2" {...common} />
        </>
      )}
    </svg>
  );
}
