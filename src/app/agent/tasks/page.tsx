import { requirePagePermission } from "@/server/auth/current";
import { TasksPage } from "@/components/shared/tasks-page";

export const metadata = { title: "Follow-ups" };

export default async function Page({ searchParams }: PageProps<"/agent/tasks">) {
  const actor = await requirePagePermission("agent", "tasks.manage_own");
  const { show } = await searchParams;
  return <TasksPage actor={actor} appHref="/agent/applications" customerHref="/agent/customers" show={show === "all" ? "ALL" : "OPEN"} />;
}
