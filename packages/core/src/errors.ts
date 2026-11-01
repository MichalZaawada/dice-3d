/** Machine-readable error codes reported by {@link D20Error}. */
export type D20ErrorCode =
  | 'INVALID_ARGUMENT'
  | 'WEBGL_UNAVAILABLE'
  | 'CONTEXT_LOST'
  | 'TEXTURE_UPLOAD_FAILED'
  | 'DISPOSED';

const ERROR_CODES: readonly D20ErrorCode[] = [
  'INVALID_ARGUMENT',
  'WEBGL_UNAVAILABLE',
  'CONTEXT_LOST',
  'TEXTURE_UPLOAD_FAILED',
  'DISPOSED',
];

/**
 * Error thrown (or used to reject a Promise) by dice-3d.
 *
 * The class name keeps the `D20` prefix of the MVP contract; future dice reuse
 * the same class and codes.
 */
export class D20Error extends Error {
  readonly code: D20ErrorCode;

  constructor(code: D20ErrorCode, message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = 'D20Error';
    this.code = code;
  }
}

/** Type guard that also works across bundle copies (checks name and code). */
export function isD20Error(error: unknown): error is D20Error {
  if (error instanceof D20Error) return true;
  if (typeof error !== 'object' || error === null) return false;
  const candidate = error as { name?: unknown; code?: unknown };
  return candidate.name === 'D20Error' && ERROR_CODES.includes(candidate.code as D20ErrorCode);
}

export function invalidArgument(message: string): D20Error {
  return new D20Error('INVALID_ARGUMENT', message);
}
