import { NextResponse } from "next/server";
import { z } from "zod";

import { answerBusinessQuestion } from "@/lib/analytics";

const schema = z.object({
  question: z.string().min(3),
});

export async function POST(request: Request) {
  const body = await request.json();
  const { question } = schema.parse(body);
  const answer = await answerBusinessQuestion(question);

  return NextResponse.json(answer);
}
