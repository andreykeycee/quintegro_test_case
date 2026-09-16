import crypto from 'crypto';

export function sign(rawBody: string, secret: string): string {
  return crypto.createHmac('sha256', secret).update(rawBody).digest('hex');
}

// Folds verification into a single helper so there is exactly one place
// that can forget to check a signature.
export function verify(rawBody: string, signature: string | string[] | undefined, secret: string): boolean {
  const sig = Array.isArray(signature) ? signature[0] : signature;
  if (!sig) return false;

  const expected = sign(rawBody, secret);
  const expectedBuf = Buffer.from(expected, 'hex');
  const actualBuf = Buffer.from(sig, 'hex');
  if (expectedBuf.length !== actualBuf.length) return false;

  return crypto.timingSafeEqual(expectedBuf, actualBuf);
}
