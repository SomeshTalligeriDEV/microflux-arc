export const sendTelegramAlert = async (message: string): Promise<boolean> => {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;

  if (!token || !chatId) {
    console.error("Telegram credentials missing in .env");
    return false;
  }

  return sendTelegramMessage(chatId, `[MFX] *MicroFlux Execution* \n\n${message}`);
};

/**
 * Dynamic message sender for replying to any user
 */
export const sendTelegramMessage = async (chatId: string | number, text: string): Promise<boolean> => {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) return false;
  const url = `https://api.telegram.org/bot${token}/sendMessage`;

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text: text,
        parse_mode: 'Markdown'
      })
    });

    if (response.ok) {
      return true;
    }

    // Fallback: Markdown parsing often fails for dynamic text (underscores, brackets, etc.).
    // Retry once as plain text to avoid dropping critical bot messages.
    const errText = await response.text();
    console.warn('Telegram sendMessage (Markdown) failed, retrying plain text:', errText);

    const fallback = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text,
      }),
    });

    if (!fallback.ok) {
      const fallbackErrText = await fallback.text();
      console.error('Telegram sendMessage fallback failed:', fallbackErrText);
    }

    return fallback.ok;
  } catch (error) {
    console.error("Telegram API Error:", error);
    return false;
  }
};