import { NextResponse } from "next/server";

import { enqueueCatalogChanges } from "@/lib/repositories";
import type { CatalogDraftChange, CatalogPublishRequest } from "@/lib/types";

const ENTITY_TYPES = new Set(["category", "product", "modifier_group"]);
const ACTIONS = new Set(["create", "update", "deactivate"]);

function isValidChange(value: unknown): value is CatalogDraftChange {
  if (!value || typeof value !== "object") return false;
  const change = value as CatalogDraftChange;
  return (
    ENTITY_TYPES.has(String(change.entityType)) &&
    ACTIONS.has(String(change.action)) &&
    (!change.entityId || Number.isInteger(Number(change.entityId))) &&
    Boolean(change.payload && typeof change.payload === "object")
  );
}

export async function POST(request: Request) {
  const body = (await request.json()) as CatalogPublishRequest;
  const changes = Array.isArray(body.changes) ? body.changes : [];

  if (changes.length === 0) {
    return NextResponse.json({ error: "No hi ha canvis per publicar" }, { status: 400 });
  }

  if (changes.length > 200) {
    return NextResponse.json({ error: "Massa canvis en una sola publicacio" }, { status: 400 });
  }

  if (!changes.every(isValidChange)) {
    return NextResponse.json({ error: "Hi ha canvis amb format invalid" }, { status: 400 });
  }

  const created = await enqueueCatalogChanges(changes, "catalog-studio");
  return NextResponse.json({ ok: true, changes: created }, { status: 202 });
}
