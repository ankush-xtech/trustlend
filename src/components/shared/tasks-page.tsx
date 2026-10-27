import Link from "next/link";
import { ListChecksIcon } from "lucide-react";
import type { Actor } from "@/server/rbac/actor";
import { listMyTasks } from "@/server/services/tasks";
import { formatDate } from "@/lib/format";
import { cn } from "@/lib/utils";
import { EmptyState, PageHeader, Section } from "./display";
import { TaskForm, TaskStatusButton } from "./task-form";

/** Personal follow-up tasks (the signed-in user's own tasks only). */
export async function TasksPage({ actor, appHref, customerHref, show }: { actor: Actor; appHref: string; customerHref?: string; show: "OPEN" | "ALL" }) {
  const tasks = await listMyTasks(actor, show === "ALL" ? "ALL" : "OPEN");
  const today = new Date().toISOString().slice(0, 10);
  return (
    <>
      <PageHeader title="Tasks & follow-ups" description="Personal reminders. Link a task from an application or customer page to keep context." />
      <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
        <Section
          title={show === "ALL" ? "All tasks" : "Open tasks"}
          actions={
            <Link href={show === "ALL" ? "?" : "?show=all"} className="text-sm text-primary hover:underline">
              {show === "ALL" ? "Show open only" : "Show completed too"}
            </Link>
          }
        >
          {tasks.length ? (
            <ul className="divide-y">
              {tasks.map((t) => {
                const overdue = t.status === "OPEN" && t.dueAt && t.dueAt.toISOString().slice(0, 10) < today;
                return (
                  <li key={t.id} className="flex flex-wrap items-start justify-between gap-3 py-3">
                    <div className="min-w-0">
                      <p className={cn("font-medium", t.status !== "OPEN" && "text-muted-foreground line-through")}>{t.title}</p>
                      {t.description ? <p className="text-sm text-muted-foreground">{t.description}</p> : null}
                      <p className={cn("mt-0.5 text-xs", overdue ? "font-medium text-destructive" : "text-muted-foreground")}>
                        {t.dueAt ? `${overdue ? "Overdue · " : "Due "}${formatDate(t.dueAt)}` : "No due date"}
                        {t.reference && t.applicationId ? (
                          <>
                            {" · "}
                            <Link href={`${appHref}/${t.applicationId}`} className="hover:underline">
                              {t.reference}
                            </Link>
                          </>
                        ) : null}
                        {t.customerName && t.customerId && customerHref ? (
                          <>
                            {" · "}
                            <Link href={`${customerHref}/${t.customerId}`} className="hover:underline">
                              {t.customerName}
                            </Link>
                          </>
                        ) : null}
                      </p>
                    </div>
                    <TaskStatusButton taskId={t.id} status={t.status} />
                  </li>
                );
              })}
            </ul>
          ) : (
            <EmptyState icon={<ListChecksIcon />} title="No tasks" description="Create a reminder to follow up with a customer or on an application." />
          )}
        </Section>
        <Section title="New task">
          <TaskForm />
        </Section>
      </div>
    </>
  );
}
