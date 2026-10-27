import { ToneBadge } from "@/components/shared/display";

interface Perm {
  key: string;
  description: string;
  category: string;
  isSensitive: boolean;
}

/**
 * Permission matrix grouped by category. Permissions the actor does not hold are disabled
 * (anti-escalation); if such a permission is already granted it is preserved via a hidden input.
 */
export function PermissionCheckboxes({
  permissions,
  checked,
  actorPermissions,
  readOnly = false,
  name = "permissionKeys",
}: {
  permissions: Perm[];
  checked: ReadonlySet<string>;
  actorPermissions: ReadonlySet<string>;
  readOnly?: boolean;
  name?: string;
}) {
  const groups = new Map<string, Perm[]>();
  for (const p of permissions) groups.set(p.category, [...(groups.get(p.category) ?? []), p]);
  return (
    <div className="grid gap-5">
      {[...groups.entries()].map(([category, perms]) => (
        <fieldset key={category} className="grid gap-2">
          <legend className="mb-1 text-sm font-semibold">{category}</legend>
          <div className="grid gap-2 md:grid-cols-2">
            {perms.map((p) => {
              const isChecked = checked.has(p.key);
              const notHeld = !actorPermissions.has(p.key);
              const disabled = readOnly || notHeld;
              return (
                <label key={p.key} className={`flex items-start gap-2 rounded-lg border p-2.5 text-sm ${disabled ? "opacity-70" : "hover:bg-muted/50"}`}>
                  <input type="checkbox" name={disabled ? undefined : name} value={p.key} defaultChecked={isChecked} disabled={disabled} className="mt-0.5 size-4 accent-[var(--primary)]" />
                  {disabled && isChecked ? <input type="hidden" name={name} value={p.key} /> : null}
                  <span className="min-w-0">
                    <span className="flex flex-wrap items-center gap-1.5">
                      <code className="text-xs font-semibold">{p.key}</code>
                      {p.isSensitive ? <ToneBadge tone="warning">sensitive</ToneBadge> : null}
                    </span>
                    <span className="block text-xs text-muted-foreground">{p.description}</span>
                    {notHeld && !readOnly ? <span className="block text-xs text-muted-foreground italic">You do not hold this permission, so you cannot change it.</span> : null}
                  </span>
                </label>
              );
            })}
          </div>
        </fieldset>
      ))}
    </div>
  );
}
