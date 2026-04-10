import { Request, Response } from 'express';
import { prisma } from '../exports/prisma';

export const generateTelegramLink = async (req: Request, res: Response) => {
  const { walletAddress, linkCode } = req.body;

  if (!walletAddress || !linkCode) {
    return res.status(400).json({ error: 'Missing wallet or code' });
  }

  try {
    // Upsert ensures that if the user doesn't exist yet, it creates them.
    // If they do exist, it just updates their temporary link code.
    const user = await prisma.user.upsert({
      where: { walletAddress },
      update: { linkCode },
      create: { 
        walletAddress, 
        linkCode 
      }
    });

    res.status(200).json({ success: true, user });
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