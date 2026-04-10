export const MICROALGOS_PER_ALGO = 1_000_000;

export const algoToMicroAlgos = (value: string | number): number => {
  const raw = String(value).trim();
  if (!raw) return 0;
  if (/e/i.test(raw)) return 0;

  const normalized = raw.replace(/,/g, '');
  if (!/^\d*\.?\d+$/.test(normalized)) return 0;

  const [wholePartRaw = '0', fractionalRaw = ''] = normalized.split('.');
  const wholePart = wholePartRaw === '' ? '0' : wholePartRaw;
  const fractionalPart = (fractionalRaw + '000000').slice(0, 6);

  const micro = BigInt(wholePart) * BigInt(MICROALGOS_PER_ALGO) + BigInt(fractionalPart || '0');
  if (micro > BigInt(Number.MAX_SAFE_INTEGER)) return 0;

  return Number(micro);
};

export const microAlgosToAlgo = (value: string | number): string => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) return '0';

  const micro = BigInt(Math.trunc(parsed));
  const whole = micro / BigInt(MICROALGOS_PER_ALGO);
  const fractional = micro % BigInt(MICROALGOS_PER_ALGO);
  const fractionalStr = fractional.toString().padStart(6, '0').replace(/0+$/, '');

  return fractionalStr ? `${whole.toString()}.${fractionalStr}` : whole.toString();
};

export const normalizeAmountToMicroAlgos = (rawAmount: unknown, unitHint?: unknown): number => {
  if (rawAmount === null || rawAmount === undefined) return 0;

  const unit = String(unitHint ?? '').trim().toLowerCase();
  const raw = String(rawAmount).trim();
  if (!raw) return 0;

  if (unit === 'algo' || unit === 'algos') {
    return algoToMicroAlgos(raw);
  }

  if (unit === 'microalgo' || unit === 'microalgos' || unit === 'micro_algo') {
    const micro = Number(rawAmount);
    return Number.isFinite(micro) && micro > 0 ? Math.trunc(micro) : 0;
  }

  if (raw.includes('.')) {
    return algoToMicroAlgos(raw);
  }

  const parsed = Number(rawAmount);
  return Number.isFinite(parsed) && parsed > 0 ? Math.trunc(parsed) : 0;
};
