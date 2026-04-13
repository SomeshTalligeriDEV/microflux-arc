import { Request, Response } from 'express';
import { prisma } from '../exports/prisma';
import { resolveNFD } from '../core/integrations/algorand/nfd';
import { Prisma } from '@prisma/client';

const normalizeWallet = (walletAddress?: string) => String(walletAddress || '').trim().toUpperCase();

const generateLinkCode = (): string => {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const randomBytes = new Uint8Array(4);
  crypto.getRandomValues(randomBytes);
  const suffix = Array.from(randomBytes)
    .map((value) => alphabet[value % alphabet.length])
    .join('');
  return `MFX-${suffix}`;
};

let _cachedBotUsername: string | null = null;

const getBotUsername = async (): Promise<string | null> => {
  if (_cachedBotUsername) return _cachedBotUsername;

  if (process.env.TELEGRAM_BOT_USERNAME) {
    _cachedBotUsername = process.env.TELEGRAM_BOT_USERNAME;
    return _cachedBotUsername;
  }

  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) return null;

  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/getMe`);
    const data = await res.json() as { ok?: boolean; result?: { username?: string } };
    if (data.ok && data.result?.username) {
      _cachedBotUsername = data.result.username;
      return _cachedBotUsername;
    }
  } catch {
    // Non-critical — deep link just won't be available
  }
  return null;
};

export const generateTelegramLink = async (req: Request, res: Response) => {
  const { walletAddress } = req.body as { walletAddress?: string };
  const normalizedWallet = normalizeWallet(walletAddress);

  if (!normalizedWallet) {
    return res.status(400).json({ error: 'walletAddress is required' });
  }

  try {
    const nfd = await resolveNFD(normalizedWallet);
    let linkCode = '';
    let linkedRecordCreated = false;

    for (let attempt = 0; attempt < 5; attempt += 1) {
      linkCode = generateLinkCode();
      try {
        await prisma.user.upsert({
          where: { walletAddress: normalizedWallet },
          update: {
            linkCode,
            ...(nfd ? { nfd } : {}),
          },
          create: {
            walletAddress: normalizedWallet,
            linkCode,
            ...(nfd ? { nfd } : {}),
          },
        });
        linkedRecordCreated = true;
        break;
      } catch (error) {
        const isUniqueCollision =
          error instanceof Prisma.PrismaClientKnownRequestError &&
          error.code === 'P2002';
        if (!isUniqueCollision) {
          throw error;
        }
      }
    }

    if (!linkedRecordCreated) {
      throw new Error('Failed to generate a unique link code after retries');
    }

    const botUsername = await getBotUsername();
    const deepLink = botUsername ? `https://t.me/${botUsername}?start=${linkCode}` : null;

    res.status(200).json({
      success: true,
      walletAddress: normalizedWallet,
      linkCode,
      command: `/link ${linkCode}`,
      botUsername: botUsername || null,
      deepLink,
    });
  } catch (error) {
    const err = error as { code?: string; message?: string; meta?: unknown; cause?: unknown };
    console.error("DB Error generating link:", {
      code: err?.code,
      message: err?.message,
      meta: err?.meta,
      cause: err?.cause,
      raw: error,
    });
    res.status(500).json({ error: 'Failed to generate link code' });
  }
};

export const getUserStatus = async (req: Request, res: Response) => {
  const walletAddress = normalizeWallet(String(req.params.walletAddress || ''));

  if (!walletAddress) {
    return res.status(400).json({ error: 'walletAddress is required' });
  }

  try {
    const user = await prisma.user.findUnique({
      where: { walletAddress },
      select: {
        walletAddress: true,
        telegramId: true,
        nfd: true,
      },
    });

    if (!user) {
      return res.status(200).json({
        linked: false,
        walletAddress,
      });
    }

    return res.status(200).json({
      linked: Boolean(user.telegramId),
      walletAddress: user.walletAddress,
      telegramId: user.telegramId,
      nfd: user.nfd,
    });
  } catch (error) {
    console.error('DB Error fetching user status:', error);
    return res.status(500).json({ error: 'Failed to fetch user status' });
  }
};
