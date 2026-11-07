"use server";
import { redirect } from "next/navigation";
import { z } from "zod";
import * as chat from "@/lib/chat";
import { requireSession } from "@/lib/session";
import { RuleError } from "@/lib/types";

export async function openDirectAction(f: FormData) {
  const s = await requireSession();
  const id = await chat.openDirect(s, z.string().uuid().parse(f.get("memberId")));
  redirect(`/equipo?c=${id}`);
}

export async function createChannelAction(f: FormData) {
  const s = await requireSession(["owner", "manager"]);
  try {
    const id = await chat.createChannel(s, String(f.get("name") ?? "").slice(0, 60), null);
    redirect(`/equipo?c=${id}`);
  } catch (e) {
    if (e instanceof RuleError) redirect(`/equipo?error=${encodeURIComponent(e.message)}`);
    throw e;
  }
}
