// Input schemas for server actions. Every action parses its FormData here
// before touching the database.
import { z } from "zod";

const text = (max: number) => z.string().trim().max(max);
const optional = (max: number) => text(max).transform((v) => v || null);
const localDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Elige un día.");
const localTime = z.string().regex(/^\d{2}:\d{2}$/, "Elige la hora.");

export const SignupInput = z.object({
  companyName: text(120).min(1, "Escribe el nombre del negocio."),
  industry: optional(80),
  locationName: text(120).min(1, "Escribe el nombre del local."),
  timezone: z.string().refine((tz) => { try { new Intl.DateTimeFormat("en", { timeZone: tz }); return true; } catch { return false; } }, "Zona horaria no válida."),
  ownerName: text(120).min(1, "Escribe tu nombre."),
  ownerEmail: z.string().trim().toLowerCase().email("Escribe un correo válido.").max(254),
});

export const LoginInput = z.object({ email: z.string().trim().toLowerCase().email("Escribe un correo válido.").max(254) });

export const MemberInput = z.object({
  fullName: text(120).min(1, "Escribe el nombre."),
  phone: optional(32).refine((v) => v === null || /^[+\d][\d\s().-]{6,}$/.test(v), "Ese celular no parece válido."),
  email: z.string().trim().toLowerCase().max(254).transform((v) => v || null).refine((v) => v === null || z.string().email().safeParse(v).success, "Ese correo no parece válido."),
  role: z.enum(["employee", "manager"]).catch("employee"),
  jobTitle: optional(60),
  wage: z.string().trim().transform((v) => (v === "" ? 0 : Math.round(Number(v) * 100)))
    .refine((c) => Number.isFinite(c) && c >= 0 && c <= 100_000, "El sueldo por hora no puede ser negativo ni mayor a $1,000."),
});

export const ShiftInput = z.object({
  week: localDate, date: localDate, start: localTime, end: localTime,
  memberId: z.string().trim().transform((v) => v || null).pipe(z.string().uuid().nullable()),
  jobTitle: optional(60),
  breakMin: z.string().trim().transform((v) => Number(v || 0)).pipe(z.number().int().min(0, "El descanso no puede ser negativo.").max(240)),
  note: optional(500),
}).refine((v) => v.start !== v.end, { message: "La hora de salida tiene que ser distinta a la de entrada." });

export const firstError = (e: z.ZodError) => e.issues[0]?.message ?? "Revisa los datos.";
export const fieldsOf = (f: FormData, keys: string[]) => Object.fromEntries(keys.map((k) => [k, String(f.get(k) ?? "")]));
export const uuid = z.string().uuid();
export const localDateSchema = localDate;
