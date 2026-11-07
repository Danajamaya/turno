import * as octo from "@/lib/octo";

// OCTO supplier endpoints for resellers (GetYourGuide, Viator, …):
//   GET  /api/octo/products            GET  /api/octo/products/{id}
//   POST /api/octo/availability        POST /api/octo/bookings
//   GET  /api/octo/bookings/{uuid}     POST /api/octo/bookings/{uuid}/confirm
//   DELETE /api/octo/bookings/{uuid}   POST /api/octo/bookings/{uuid}/cancel
type Ctx = { params: Promise<{ path: string[] }> };

async function handle(req: Request, ctx: Ctx, method: "GET" | "POST" | "DELETE") {
  try {
    const caller = await octo.authenticate(req.headers.get("authorization"));
    const [a, b, c] = (await ctx.params).path;
    const body = method === "POST" ? await req.json().catch(() => { throw new octo.OctoError(400, "BAD_REQUEST", "Body must be JSON"); }) : {};
    if (method === "GET" && a === "products" && !b) return Response.json(await octo.products(caller));
    if (method === "GET" && a === "products" && b) {
      const p = (await octo.products(caller)).find((x) => x.id === b);
      return p ? Response.json(p) : Response.json({ error: "INVALID_PRODUCT_ID", errorMessage: "Unknown product" }, { status: 400 });
    }
    if (method === "POST" && a === "availability") return Response.json(await octo.availability(caller, body));
    if (method === "POST" && a === "bookings" && !b) return Response.json(await octo.reserve(caller, body));
    if (method === "GET" && a === "bookings" && b && !c) return Response.json(await octo.getBooking(caller, b));
    if (method === "POST" && a === "bookings" && b && c === "confirm") return Response.json(await octo.confirm(caller, b, body));
    if ((method === "DELETE" && a === "bookings" && b && !c) || (method === "POST" && a === "bookings" && b && c === "cancel")) return Response.json(await octo.cancel(caller, b));
    return Response.json({ error: "NOT_FOUND", errorMessage: "Unknown endpoint" }, { status: 404 });
  } catch (e) {
    if (e instanceof octo.OctoError) return Response.json({ error: e.error, errorMessage: e.message }, { status: e.status });
    console.error("octo", e);
    return Response.json({ error: "INTERNAL_SERVER_ERROR", errorMessage: "Something went wrong" }, { status: 500 });
  }
}

export const GET = (req: Request, ctx: Ctx) => handle(req, ctx, "GET");
export const POST = (req: Request, ctx: Ctx) => handle(req, ctx, "POST");
export const DELETE = (req: Request, ctx: Ctx) => handle(req, ctx, "DELETE");
