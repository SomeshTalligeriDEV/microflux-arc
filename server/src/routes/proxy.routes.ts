import { Router, Request, Response } from 'express';

const router = Router();

function isAllowedProxyUrl(raw: string): boolean {
  try {
    const u = new URL(raw);
    if (u.protocol !== 'https:') return false;
    const h = u.hostname.toLowerCase();
    if (h === 'localhost' || h === '127.0.0.1' || h.startsWith('192.168.') || h.startsWith('10.')) {
      return false;
    }
    return true;
  } catch {
    return false;
  }
}

/**
 * Server-side HTTPS fetch for workflow http_request nodes (avoids browser CORS).
 */
router.post('/http', async (req: Request, res: Response) => {
  try {
    const { url, method = 'GET', headers: hdrs = {}, body: reqBody } = req.body ?? {};
    const target = String(url ?? '').trim();

    if (!target || !isAllowedProxyUrl(target)) {
      return res.status(400).json({
        error: 'A valid https:// URL is required (localhost and private IPs blocked)',
      });
    }

    const m = String(method).toUpperCase();
    const headerObj: Record<string, string> = {
      Accept: 'application/json, text/plain, */*',
      ...(typeof hdrs === 'object' && hdrs !== null && !Array.isArray(hdrs)
        ? Object.fromEntries(
            Object.entries(hdrs as Record<string, unknown>).map(([k, v]) => [k, String(v)]),
          )
        : {}),
    };

    const init: RequestInit = {
      method: m,
      headers: headerObj,
      signal: AbortSignal.timeout(20_000),
    };

    if (m !== 'GET' && m !== 'HEAD' && reqBody !== undefined) {
      headerObj['Content-Type'] = headerObj['Content-Type'] ?? 'application/json';
      init.body = typeof reqBody === 'string' ? reqBody : JSON.stringify(reqBody);
    }

    const r = await fetch(target, init);
    const text = await r.text();
    let parsed: unknown = text;
    try {
      parsed = JSON.parse(text);
    } catch {
      /* keep text */
    }

    return res.status(200).json({
      ok: r.ok,
      status: r.status,
      data: parsed,
    });
  } catch (err) {
    console.error('[PROXY HTTP]', err);
    return res.status(500).json({ error: err instanceof Error ? err.message : 'Proxy request failed' });
  }
});

export default router;
