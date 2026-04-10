const SARVAM_STT_URL = 'https://api.sarvam.ai/speech-to-text';

function extractTranscript(payload: any): string {
  const candidates = [
    payload?.transcript,
    payload?.text,
    payload?.result?.transcript,
    payload?.result?.text,
    payload?.data?.transcript,
    payload?.data?.text,
    payload?.output?.transcript,
  ];

  for (const value of candidates) {
    if (typeof value === 'string' && value.trim().length > 0) {
      return value.trim();
    }
  }

  throw new Error('No transcript found in Sarvam response');
}

export const transcribeAudio = async (audioBuffer: Buffer, filename: string): Promise<string> => {
  const apiKey = process.env.SARVAM_API_KEY;
  if (!apiKey) {
    throw new Error('SARVAM_API_KEY is not configured');
  }

  const form = new FormData();
  const audioBytes = Uint8Array.from(audioBuffer);
  form.append('file', new Blob([audioBytes], { type: 'audio/ogg' }), filename);
  form.append('model', 'saaras:v3');

  const response = await fetch(SARVAM_STT_URL, {
    method: 'POST',
    headers: {
      'api-subscription-key': apiKey,
    },
    body: form,
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Sarvam STT failed (${response.status}): ${body}`);
  }

  const payload = await response.json();
  return extractTranscript(payload);
};
