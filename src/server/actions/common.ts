"use server";

import type { ActionState } from "@/lib/action-state";
import { requireActor } from "@/server/auth/current";
import { markNotificationsRead } from "@/server/services/notifications";
import { runAction } from "./run";

export async function markAllNotificationsReadAction(): Promise<ActionState> {
  return runAction(async () => markNotificationsRead(await requireActor(), "all"), "All notifications marked as read.");
}
