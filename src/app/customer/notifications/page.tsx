import { NotificationsPage } from "@/components/shared/notifications-page";
import { requirePortal } from "@/server/auth/current";

export const metadata = { title: "Notifications" };

export default async function Page() {
  return <NotificationsPage actor={await requirePortal("customer")} />;
}
