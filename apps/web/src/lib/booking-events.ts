// What happens after a booking arrives, changes or is cancelled, from any
// platform: tell the waiting list, warn about overbooking, notify phones.
// Failures here are logged, never thrown: the booking itself is already saved.
import "server-only";
import { system } from "./db";
import { notifyMembers } from "./push";
import { alertIfOverbooked, notifyWaitlist } from "./waitlist";

export async function afterBookingChange(bookingId: string, kind: "new" | "change" | "cancel"): Promise<void> {
  try {
    const [b] = await system((tx) => tx<{ companyId: string; startsAt: string; tourName: string | null; people: number; platform: string; guideMemberId: string | null }[]>`
      select company_id, starts_at, tour_name, people, platform, guide_member_id from bookings where id = ${bookingId}`);
    if (!b) return;
    const when = new Date(b.startsAt);
    if (kind === "cancel") {
      await notifyWaitlist(b.companyId, b.tourName, b.startsAt);
      await notifyMembers(b.companyId, { managers: true, memberIds: b.guideMemberId ? [b.guideMemberId] : [] },
        { title: "Reserva cancelada", body: `${b.tourName ?? "Tour"}: ${b.people} ${b.people === 1 ? "persona" : "personas"} menos`, url: "/inicio", at: when });
      return;
    }
    await alertIfOverbooked(b.companyId, b.startsAt, b.tourName);
    if (kind === "new") await notifyMembers(b.companyId, { managers: true, memberIds: b.guideMemberId ? [b.guideMemberId] : [] },
      { title: "Nueva reserva", body: `${b.tourName ?? "Tour"}: ${b.people} ${b.people === 1 ? "persona" : "personas"}`, url: "/inicio", at: when });
  } catch (e) {
    console.error("afterBookingChange failed", bookingId, e);
  }
}
