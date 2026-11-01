import type { Pose } from '../animation/tracks.js';
import type { FaceUV } from '../types.js';

/** Theme after validation, still in `#RRGGBB` notation. */
export interface ResolvedTheme {
  readonly bodyColor: string;
  readonly edgeColor: string;
  readonly numberColor: string;
  readonly background: string;
}

export type SkinSourceKind = 'image' | 'bitmap' | 'canvas';

/** Skin after validation; UVs are listed in mesh face order. */
export interface PreparedSkin {
  readonly source: TexImageSource;
  readonly width: number;
  readonly height: number;
  readonly faces: readonly FaceUV[];
  readonly numbers: 'overlay' | 'in-texture';
}

/**
 * Internal renderer contract. The public API never exposes renderer objects,
 * so the backend can change without breaking consumers.
 */
export interface DieRenderer {
  readonly maxTextureSize: number;
  setTheme(theme: ResolvedTheme): void;
  /**
   * Uploads a new skin texture. On failure the previous appearance is kept and
   * a `TEXTURE_UPLOAD_FAILED` error is thrown. On success the previous texture is released.
   */
  setSkin(skin: PreparedSkin | null): void;
  /** Drawing-buffer size in device pixels; a zero dimension suspends rendering. */
  setSize(width: number, height: number): void;
  /** Whether a frame can currently be drawn (positive size, live context). */
  canRender(): boolean;
  render(pose: Pose): void;
  isContextLost(): boolean;
  dispose(): void;
}
