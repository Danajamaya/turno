import { Shell } from "@/components/shell";
import { requireSession } from "@/lib/session";

export default async function ManagerLayout({ children }: { children: React.ReactNode }) {
  const s = await requireSession(["owner", "manager"]);
  return <Shell s={s}>{children}</Shell>;
}
