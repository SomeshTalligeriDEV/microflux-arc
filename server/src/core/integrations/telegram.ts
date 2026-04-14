/**
 * Telegram accepts string or number for chat_id. Normalize stored DB values and avoid precision loss.
 */
export function normalizeTelegramChatId(chatId: string | number): string | number {
  if (typeof chatId === 'number' && Number.isFinite(chatId)) return chatId;
  const s = String(chatId).trim();
  if (/^-?\d+$/.test(s)) {
    const n = Number(s);
    if (Number.isSafeInteger(n)) return n;
    return s;
  }
  return s;
}

async function parseTelegramErrorResponse(resp: Response): Promise<string> {
  const t = await resp.text();
  try {
    const j = JSON.parse(t) as { description?: string };
    if (j.description) return j.description;
  } catch {
    /* keep raw */
  }
  return t.slice(0, 300);
}

type SendResult = { ok: true } | { ok: false; description: string };

/**
 * Same as sendTelegramMessage but returns Telegram's error description on failure.
 */
export async function sendTelegramMessageResult(
  chatId: string | number,
  text: string,
): Promise<SendResult> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) {
    return { ok: false, description: 'TELEGRAM_BOT_TOKEN not set' };
  }

  const id = normalizeTelegramChatId(chatId);
  const url = `https://api.telegram.org/bot${token}/sendMessage`;

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: id,
        text,
        parse_mode: 'Markdown',
      }),
    });

    if (response.ok) return { ok: true };

    const errDesc = await parseTelegramErrorResponse(response);
    console.warn('Telegram sendMessage (Markdown) failed, retrying plain text:', errDesc);

    const fallback = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: id,
        text,
      }),
    });

    if (fallback.ok) return { ok: true };

    const err2 = await parseTelegramErrorResponse(fallback);
    console.error('Telegram sendMessage fallback failed:', err2);
    return { ok: false, description: err2 };
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Telegram API error';
    console.error('Telegram API Error:', error);
    return { ok: false, description: msg };
  }
}

export const sendTelegramAlert = async (message: string): Promise<boolean> => {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;

  if (!token || !chatId) {
    console.error('Telegram credentials missing in .env');
    return false;
  }

  return sendTelegramMessage(chatId, `[MFX] *MicroFlux Execution* \n\n${message}`);
};

/**
 * Dynamic message sender for replying to any user
 */
export const sendTelegramMessage = async (chatId: string | number, text: string): Promise<boolean> => {
  const r = await sendTelegramMessageResult(chatId, text);
  return r.ok;
};
