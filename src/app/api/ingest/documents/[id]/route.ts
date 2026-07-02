import { NextResponse } from "next/server";

import { deleteUploadedDocument } from "@/lib/repositories";

type RouteContext = { params: Promise<{ id: string }> };

export async function DELETE(_request: Request, context: RouteContext) {
  const { id } = await context.params;
  const documentId = id.trim();

  if (!documentId) {
    return NextResponse.json({ error: "Document invalid" }, { status: 400 });
  }

  try {
    const deleted = await deleteUploadedDocument(documentId);
    if (!deleted) {
      return NextResponse.json({ error: "Document no trobat" }, { status: 404 });
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Delete uploaded document failed:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Error eliminant el document" },
      { status: 500 },
    );
  }
}
