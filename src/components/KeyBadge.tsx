interface KeyBadgeProps {
  label: string;
  size?: "sm" | "md";
}

export function KeyBadge({ label, size = "md" }: KeyBadgeProps) {
  const base =
    "inline-flex items-center justify-center font-mono font-semibold rounded " +
    "border border-white/10 bg-ph-elevated text-ph-text select-none leading-none";
  const sz = size === "sm"
    ? "px-1.5 py-0.5 text-[11px] min-w-[22px]"
    : "px-2 py-1 text-xs min-w-[28px]";
  return <span className={`${base} ${sz}`}>{label}</span>;
}

interface HotkeyBadgesProps {
  modifier: string;
  keyName: string;
  size?: "sm" | "md";
}

export function HotkeyBadges({ modifier, keyName, size }: HotkeyBadgesProps) {
  if (!modifier && !keyName) {
    return <span className="text-ph-faint text-xs font-mono">—</span>;
  }
  return (
    <span className="inline-flex items-center gap-1">
      {modifier && <KeyBadge label={modifier} size={size} />}
      {modifier && keyName && (
        <span className="text-ph-faint text-xs">+</span>
      )}
      {keyName && <KeyBadge label={keyName} size={size} />}
    </span>
  );
}
