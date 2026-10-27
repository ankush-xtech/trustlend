import { requirePagePermission } from "@/server/auth/current";
import { TasksPage } from "@/components/shared/tasks-page";

export const metadata = { title: "Tasks" };

export default async function Page({ searchParams }: PageProps<"/staff/tasks">) {
  const actor = await requirePagePermission("staff", "tasks.manage_own");
  const { show } = await searchParams;
  return <TasksPage actor={actor} appHref="/staff/applications" show={show === "all" ? "ALL" : "OPEN"} />;
}
