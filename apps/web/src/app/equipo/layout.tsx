import { Shell } from "@/components/shell";
import { requireSession } from "@/lib/session";

// The team chat is for everyone: managers and guides.
export default async function TeamChatLayout({ children }: { children: React.ReactNode }) {
  const s = await requireSession();
  return <Shell s={s} flush>{children}</Shell>;
}
