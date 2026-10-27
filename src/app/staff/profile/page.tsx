import { ProfilePage } from "@/components/shared/profile-page";
import { requirePortal } from "@/server/auth/current";

export const metadata = { title: "Profile" };

export default async function Page() {
  return <ProfilePage actor={await requirePortal("staff")} />;
}
