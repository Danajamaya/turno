// Row shapes as read from Postgres (camel-cased by lib/db.ts).
export type Role = "owner" | "manager" | "employee";

export interface Company { id: string; name: string; industry: string | null; currency: string; stripeCustomerId: string | null; createdAt: string }

export interface Location {
  id: string; companyId: string; name: string; timezone: string;
  weekStartDay: number; earlyClockInMin: number; otWeeklyMin: number; otDailyMin: number | null;
}

export interface Member {
  id: string; companyId: string; userId: string | null; fullName: string; email: string | null; phone: string | null;
  role: Role; status: "invited" | "active" | "archived";
  jobTitle: string | null; wageCents: number; colour: number; // 1..8, role-n token
}

export interface ScheduleWeek {
  id: string; companyId: string; locationId: string; weekStart: string;
  status: "draft" | "published"; publishedAt: string | null; publishedBy: string | null;
}

export interface Shift {
  id: string; companyId: string; locationId: string; scheduleWeekId: string;
  memberId: string | null; jobTitle: string | null; startAt: string; endAt: string;
  unpaidBreakMin: number; note: string | null; publishedVersion: number; dirty: boolean;
}

export interface TimeCard {
  id: string; companyId: string; locationId: string; memberId: string; shiftId: string | null;
  wageCents: number; clockInAt: string; clockOutAt: string | null;
  source: "kiosk" | "mobile" | "web" | "manual"; approvedAt: string | null;
}

export interface Subscription {
  plan: "free" | "essentials" | "plus"; status: "trialing" | "active" | "past_due" | "canceled" | "incomplete";
  locationQuantity: number; currentPeriodEnd: string | null; stripeSubscriptionId: string | null;
}

export interface Session { userId: string; member: Member; company: Company; location: Location }

export class RuleError extends Error {
  constructor(public code: string, message: string) { super(message); }
}

/** People a free plan can have on the team (owner included). */
export const FREE_PLAN_PEOPLE = 10;
