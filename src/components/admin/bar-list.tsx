/** Accessible horizontal bar list (real values shown as text; bars are decorative). */
export function BarList({ items, emptyText = "No data yet." }: { items: { label: string; value: number; href?: string }[]; emptyText?: string }) {
  const max = Math.max(0, ...items.map((i) => i.value));
  if (items.length === 0 || max === 0) return <p className="text-sm text-muted-foreground">{emptyText}</p>;
  return (
    <ul className="grid gap-3">
      {items.map((i) => (
        <li key={i.label} className="grid gap-1">
          <div className="flex items-baseline justify-between gap-2 text-sm">
            <span className="truncate">{i.href ? <a href={i.href} className="hover:underline">{i.label}</a> : i.label}</span>
            <span className="font-medium tabular-nums">{i.value}</span>
          </div>
          <div className="h-2 rounded-full bg-muted" aria-hidden>
            <div className="h-2 rounded-full bg-primary" style={{ width: `${Math.max(2, (i.value / max) * 100)}%` }} />
          </div>
        </li>
      ))}
    </ul>
  );
}
