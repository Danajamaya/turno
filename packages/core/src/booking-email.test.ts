// Synthetic emails written for these tests: they exercise the generic reader's
// patterns, they are NOT copies of any platform's real format. Real anonymised
// samples go in fixtures/ once the owner provides them.
import { describe, expect, it } from "vitest";
import { bookingStart, detectPlatform, findDate, findPeople, findRef, findTime, readBookingEmail, AUTO_IMPORT_CONFIDENCE } from "./index.ts";

describe("pieces", () => {
  it("detects the platform from the sender only", () => {
    expect(detectPlatform("GuruWalk <noreply@guruwalk.com>")).toBe("guruwalk");
    expect(detectPlatform("bookings@mail.getyourguide.com")).toBe("getyourguide");
    expect(detectPlatform("Juan <juan@gmail.com>")).toBe("unknown");
    expect(detectPlatform("x@guruwalk.com.evil.io")).toBe("unknown");
  });
  it("reads dates in Spanish and English, day first for numbers", () => {
    expect(findDate("el 14 de noviembre de 2026")).toBe("2026-11-14");
    expect(findDate("on November 14, 2026")).toBe("2026-11-14");
    expect(findDate("14/11/2026")).toBe("2026-11-14");
    expect(findDate("sáb 14 nov 2026")).toBe("2026-11-14");
    expect(findDate("2026-11-14")).toBe("2026-11-14");
  });
  it("reads times", () => {
    expect(findTime("10:30h")).toBe("10:30");
    expect(findTime("3:30 PM")).toBe("15:30");
    expect(findTime("11 a.m.")).toBe("11:00");
    expect(findTime("12:00 am")).toBe("00:00");
  });
  it("reads people and references", () => {
    expect(findPeople("Reserva para 4 personas")).toBe(4);
    expect(findPeople("Participants: 3")).toBe(3);
    expect(findPeople("2 adults")).toBe(2);
    expect(findRef("Booking ID: GW-48213")).toBe("GW-48213");
    expect(findRef("Localizador: ab12cd34")).toBe("AB12CD34");
  });
});

describe("whole emails", () => {
  const es = {
    from: "GuruWalk <noreply@guruwalk.com>",
    subject: "¡Nueva reserva en tu tour!",
    text: "Hola Ana,\nTienes una nueva reserva.\nTour: Free tour Madrid de los Austrias\nFecha: sábado, 14 de noviembre de 2026\nHora: 10:30\nPersonas: 3\nNombre: Laura Gómez\nTeléfono: +34 600 123 456\nReserva nº: GW48213\n",
  };
  it("imports a complete booking from a known platform", () => {
    const p = readBookingEmail(es);
    expect(p).toMatchObject({ platform: "guruwalk", kind: "new", externalRef: "GW48213", date: "2026-11-14", time: "10:30", people: 3, travellerName: "Laura Gómez", travellerPhone: "+34600123456", tourName: "Free tour Madrid de los Austrias" });
    expect(p.confidence).toBeGreaterThanOrEqual(AUTO_IMPORT_CONFIDENCE);
    expect(bookingStart(p, "Europe/Madrid")!.toISOString()).toBe("2026-11-14T09:30:00.000Z");
  });
  it("recognises cancellations and changes", () => {
    expect(readBookingEmail({ ...es, subject: "Reserva cancelada" }).kind).toBe("cancel");
    expect(readBookingEmail({ from: "a@freetour.com", subject: "Booking cancelled", text: "Booking ID: FT-99812 has been cancelled." })).toMatchObject({ kind: "cancel", externalRef: "FT-99812" });
    expect(readBookingEmail({ ...es, subject: "Tu reserva ha cambiado" }).kind).toBe("change");
  });
  it("reads an English booking", () => {
    const p = readBookingEmail({ from: "Strawberry Tours <info@strawberrytours.com>", subject: "New booking", text: "Activity: Free Walking Tour Barcelona\nDate: November 15, 2026\nTime: 4:00 PM\n2 people\nName: John Smith\nemail john.smith@example.com\nBooking reference: ST-55120" });
    expect(p).toMatchObject({ platform: "strawberry", date: "2026-11-15", time: "16:00", people: 2, externalRef: "ST-55120", travellerEmail: "john.smith@example.com" });
    expect(p.confidence).toBeGreaterThanOrEqual(AUTO_IMPORT_CONFIDENCE);
  });
  it("never auto-imports from an unknown sender or with missing fields", () => {
    expect(readBookingEmail({ ...es, from: "someone@gmail.com" }).confidence).toBeLessThan(AUTO_IMPORT_CONFIDENCE);
    expect(readBookingEmail({ ...es, text: "Tienes una nueva reserva. Fecha: 14/11/2026" }).confidence).toBeLessThan(AUTO_IMPORT_CONFIDENCE);
  });
});
