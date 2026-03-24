import { answerBusinessQuestion } from "@/lib/analytics";
import { env } from "@/lib/env";
import { findTelegramUser, storeTelegramMessage } from "@/lib/repositories";

export async function handleTelegramUpdate(update: Record<string, unknown>) {
  const message = update.message as
    | {
        text?: string;
        from?: { id?: number };
        chat?: { id?: number };
      }
    | undefined;

  if (!message?.text || !message.from?.id) {
    return { ok: true, ignored: true };
  }

  const telegramUserId = String(message.from.id);
  const user = await findTelegramUser(telegramUserId);

  if (!user) {
    if (message.chat?.id) {
      await sendTelegramMessage(message.chat.id, "No tienes acceso autorizado a este bot.");
    }

    return { ok: false, reason: "unauthorized" };
  }

  const answer = await answerBusinessQuestion(message.text);

  await storeTelegramMessage({
    telegramUserId,
    username: user.username,
    question: message.text,
    answer: answer.answer,
  });

  if (message.chat?.id) {
    await sendTelegramMessage(message.chat.id, answer.answer);
  }

  return { ok: true };
}

export async function sendTelegramMessage(chatId: number, text: string) {
  if (!env.TELEGRAM_BOT_TOKEN) {
    return;
  }

  await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      chat_id: chatId,
      text,
    }),
  });
}
