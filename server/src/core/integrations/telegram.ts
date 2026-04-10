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

    return response.ok;
  } catch (error) {
    console.error("Telegram API Error:", error);
    return false;
  }
};