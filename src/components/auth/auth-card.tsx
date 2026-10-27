import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export function AuthCard({ title, description, children, footer }: { title: string; description?: ReactNode; children: ReactNode; footer?: ReactNode }) {
  return (
    <div>
      <h1 className="text-2xl font-bold tracking-tight">{title}</h1>
      {description ? <p className="mt-2 text-sm leading-6 text-muted-foreground">{description}</p> : null}
      <div className="mt-8">{children}</div>
      {footer ? <div className="mt-8 text-sm text-muted-foreground">{footer}</div> : null}
    </div>
  );
}

export function Notice({ tone = "info", children }: { tone?: "info" | "success" | "warning" | "error"; children: ReactNode }) {
  const tones = {
    info: "border-info/25 bg-info/5 text-info",
    success: "border-success/25 bg-success/10 text-success",
    warning: "border-warning/30 bg-warning/10 text-[oklch(0.4_0.09_65)]",
    error: "border-destructive/30 bg-destructive/5 text-destructive",
  };
  return (
    <div role={tone === "error" ? "alert" : "status"} className={cn("mb-6 rounded-lg border px-3 py-2.5 text-sm", tones[tone])}>
      {children}
    </div>
  );
}
