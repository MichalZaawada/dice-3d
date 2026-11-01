import { D20Error } from '../errors.js';
import { fromRotationTranslation } from './matrix.js';
import { viewProjection } from './camera.js';
import { hexToLinear, parseHexColor } from './color.js';
import { buildSkinUVs, MESH_LAYOUT, MESH_STRIDE, type DieMesh } from './dieMesh.js';
import type { DieRenderer, PreparedSkin, ResolvedTheme } from './renderer.js';
import { FRAGMENT_SHADER, VERTEX_SHADER } from './shaders.js';
import { normalize } from '../animation/vector.js';

const CONTEXT_ATTRIBUTES: WebGLContextAttributes = {
  alpha: true,
  antialias: true,
  depth: true,
  stencil: false,
  premultipliedAlpha: true,
  preserveDrawingBuffer: false,
  powerPreference: 'low-power',
};

const LIGHT_DIRECTION = normalize([-0.35, 0.55, 1]);
const SKIN_UV_LOCATION = 5;

interface Uniforms {
  model: WebGLUniformLocation | null;
  viewProjection: WebGLUniformLocation | null;
  bodyColor: WebGLUniformLocation | null;
  edgeColor: WebGLUniformLocation | null;
  numberColor: WebGLUniformLocation | null;
  lightDirection: WebGLUniformLocation | null;
  useSkin: WebGLUniformLocation | null;
  showNumbers: WebGLUniformLocation | null;
  edgeWidth: WebGLUniformLocation | null;
  atlasGrid: WebGLUniformLocation | null;
  skin: WebGLUniformLocation | null;
  numbers: WebGLUniformLocation | null;
}

/**
 * Minimal purpose-built WebGL2 renderer: one draw call of flat-shaded triangles,
 * numbers from a signed-distance atlas and edges from barycentric coordinates.
 * Throws `WEBGL_UNAVAILABLE` when a WebGL2 context or the shaders are unavailable.
 */
export function createWebGL2Renderer<V extends number>(canvas: HTMLCanvasElement, mesh: DieMesh<V>): DieRenderer {
  let gl: WebGL2RenderingContext | null;
  try {
    gl = canvas.getContext('webgl2', CONTEXT_ATTRIBUTES);
  } catch (error) {
    throw new D20Error('WEBGL_UNAVAILABLE', 'Creating a WebGL2 context failed', { cause: error });
  }
  if (!gl) throw new D20Error('WEBGL_UNAVAILABLE', 'WebGL2 is not available in this browser or context');
  const context = gl;

  let program: WebGLProgram;
  try {
    program = createProgram(context);
  } catch (error) {
    context.getExtension('WEBGL_lose_context')?.loseContext();
    throw error;
  }
  const uniforms: Uniforms = {
    model: context.getUniformLocation(program, 'uModel'),
    viewProjection: context.getUniformLocation(program, 'uViewProjection'),
    bodyColor: context.getUniformLocation(program, 'uBodyColor'),
    edgeColor: context.getUniformLocation(program, 'uEdgeColor'),
    numberColor: context.getUniformLocation(program, 'uNumberColor'),
    lightDirection: context.getUniformLocation(program, 'uLightDirection'),
    useSkin: context.getUniformLocation(program, 'uUseSkin'),
    showNumbers: context.getUniformLocation(program, 'uShowNumbers'),
    edgeWidth: context.getUniformLocation(program, 'uEdgeWidth'),
    atlasGrid: context.getUniformLocation(program, 'uAtlasGrid'),
    skin: context.getUniformLocation(program, 'uSkin'),
    numbers: context.getUniformLocation(program, 'uNumbers'),
  };

  const vertexArray = context.createVertexArray();
  const meshBuffer = context.createBuffer();
  const skinUVBuffer = context.createBuffer();
  context.bindVertexArray(vertexArray);
  context.bindBuffer(context.ARRAY_BUFFER, meshBuffer);
  context.bufferData(context.ARRAY_BUFFER, mesh.data, context.STATIC_DRAW);
  const stride = MESH_STRIDE * Float32Array.BYTES_PER_ELEMENT;
  Object.values(MESH_LAYOUT).forEach((attribute, location) => {
    context.enableVertexAttribArray(location);
    context.vertexAttribPointer(location, attribute.size, context.FLOAT, false, stride, attribute.offset * 4);
  });
  context.bindBuffer(context.ARRAY_BUFFER, skinUVBuffer);
  context.bufferData(context.ARRAY_BUFFER, new Float32Array(mesh.vertexCount * 2), context.DYNAMIC_DRAW);
  context.enableVertexAttribArray(SKIN_UV_LOCATION);
  context.vertexAttribPointer(SKIN_UV_LOCATION, 2, context.FLOAT, false, 0, 0);
  context.bindVertexArray(null);

  const atlasTexture = context.createTexture();
  context.bindTexture(context.TEXTURE_2D, atlasTexture);
  context.pixelStorei(context.UNPACK_ALIGNMENT, 1);
  context.texImage2D(
    context.TEXTURE_2D, 0, context.R8, mesh.atlas.width, mesh.atlas.height, 0,
    context.RED, context.UNSIGNED_BYTE, mesh.atlas.pixels,
  );
  context.pixelStorei(context.UNPACK_ALIGNMENT, 4);
  context.generateMipmap(context.TEXTURE_2D);
  setSamplerParameters(context);

  const placeholderSkin = context.createTexture();
  context.bindTexture(context.TEXTURE_2D, placeholderSkin);
  context.texImage2D(
    context.TEXTURE_2D, 0, context.RGBA, 1, 1, 0, context.RGBA, context.UNSIGNED_BYTE,
    new Uint8Array([255, 255, 255, 255]),
  );
  context.bindTexture(context.TEXTURE_2D, null);

  const anisotropy = context.getExtension('EXT_texture_filter_anisotropic');
  const maxTextureSize = Number(context.getParameter(context.MAX_TEXTURE_SIZE)) || 2048;

  let skinTexture: WebGLTexture | null = null;
  let showNumbers = true;
  let theme: ResolvedTheme | null = null;
  let clear: readonly [number, number, number, number] = [0, 0, 0, 0];
  let width = 0;
  let height = 0;
  let disposed = false;

  const releaseGpuResources = () => {
    context.deleteTexture(skinTexture);
    context.deleteTexture(placeholderSkin);
    context.deleteTexture(atlasTexture);
    context.deleteBuffer(meshBuffer);
    context.deleteBuffer(skinUVBuffer);
    context.deleteVertexArray(vertexArray);
    context.deleteProgram(program);
    skinTexture = null;
  };

  const canRender = () => !disposed && width > 0 && height > 0 && !context.isContextLost();

  return {
    maxTextureSize,

    setTheme(next) {
      theme = next;
      if (next.background === 'transparent') clear = [0, 0, 0, 0];
      else {
        const [r, g, b] = parseHexColor(next.background);
        clear = [r, g, b, 1];
      }
    },

    setSkin(skin) {
      if (disposed) return;
      if (!skin) {
        context.deleteTexture(skinTexture);
        skinTexture = null;
        showNumbers = true;
        return;
      }
      if (context.isContextLost()) {
        throw new D20Error('TEXTURE_UPLOAD_FAILED', 'Cannot upload a skin: the WebGL context is lost');
      }
      const texture = uploadSkinTexture(context, skin, anisotropy);
      context.bindBuffer(context.ARRAY_BUFFER, skinUVBuffer);
      context.bufferSubData(context.ARRAY_BUFFER, 0, buildSkinUVs(skin.faces));
      context.bindBuffer(context.ARRAY_BUFFER, null);
      context.deleteTexture(skinTexture);
      skinTexture = texture;
      showNumbers = skin.numbers === 'overlay';
    },

    setSize(nextWidth, nextHeight) {
      width = Math.max(0, Math.floor(nextWidth));
      height = Math.max(0, Math.floor(nextHeight));
      if (width > 0 && height > 0 && (canvas.width !== width || canvas.height !== height)) {
        canvas.width = width;
        canvas.height = height;
      }
    },

    canRender,

    render(pose) {
      if (!canRender() || !theme) return;
      context.viewport(0, 0, width, height);
      context.clearColor(clear[0], clear[1], clear[2], clear[3]);
      context.clearDepth(1);
      context.enable(context.DEPTH_TEST);
      context.enable(context.CULL_FACE);
      context.cullFace(context.BACK);
      context.clear(context.COLOR_BUFFER_BIT | context.DEPTH_BUFFER_BIT);

      context.useProgram(program);
      context.uniformMatrix4fv(uniforms.model, false, fromRotationTranslation(pose.rotation, pose.offset));
      context.uniformMatrix4fv(uniforms.viewProjection, false, viewProjection(width / height));
      context.uniform3fv(uniforms.bodyColor, hexToLinear(theme.bodyColor));
      context.uniform3fv(uniforms.edgeColor, hexToLinear(theme.edgeColor));
      context.uniform3fv(uniforms.numberColor, hexToLinear(theme.numberColor));
      context.uniform3fv(uniforms.lightDirection, LIGHT_DIRECTION);
      context.uniform1f(uniforms.useSkin, skinTexture ? 1 : 0);
      context.uniform1f(uniforms.showNumbers, showNumbers ? 1 : 0);
      context.uniform1f(uniforms.edgeWidth, Math.max(0.9, 0.0055 * Math.min(width, height)));
      context.uniform2f(uniforms.atlasGrid, mesh.atlas.columns, mesh.atlas.rows);

      context.activeTexture(context.TEXTURE0);
      context.bindTexture(context.TEXTURE_2D, skinTexture ?? placeholderSkin);
      context.uniform1i(uniforms.skin, 0);
      context.activeTexture(context.TEXTURE1);
      context.bindTexture(context.TEXTURE_2D, atlasTexture);
      context.uniform1i(uniforms.numbers, 1);

      context.bindVertexArray(vertexArray);
      context.drawArrays(context.TRIANGLES, 0, mesh.vertexCount);
      context.bindVertexArray(null);
    },

    isContextLost() {
      return context.isContextLost();
    },

    dispose() {
      if (disposed) return;
      disposed = true;
      if (!context.isContextLost()) {
        releaseGpuResources();
        // Release the context eagerly; browsers cap the number of live contexts.
        context.getExtension('WEBGL_lose_context')?.loseContext();
      }
      canvas.width = 1;
      canvas.height = 1;
    },
  };
}

function setSamplerParameters(gl: WebGL2RenderingContext): void {
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
}

function uploadSkinTexture(
  gl: WebGL2RenderingContext,
  skin: PreparedSkin,
  anisotropy: EXT_texture_filter_anisotropic | null,
): WebGLTexture {
  const texture = gl.createTexture();
  if (!texture) throw new D20Error('TEXTURE_UPLOAD_FAILED', 'Could not allocate a texture for the skin');
  while (gl.getError() !== gl.NO_ERROR) {
    // Drain unrelated errors so that the check below only reflects this upload.
  }
  try {
    gl.bindTexture(gl.TEXTURE_2D, texture);
    // Image row 0 is the top edge, matching UV (0, 0) = top-left; no Y flip needed.
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.SRGB8_ALPHA8, gl.RGBA, gl.UNSIGNED_BYTE, skin.source);
    const uploadError = gl.getError();
    if (uploadError !== gl.NO_ERROR) throw new Error(`texImage2D failed with GL error 0x${uploadError.toString(16)}`);
    gl.generateMipmap(gl.TEXTURE_2D);
    setSamplerParameters(gl);
    if (anisotropy) {
      const max = Number(gl.getParameter(anisotropy.MAX_TEXTURE_MAX_ANISOTROPY_EXT)) || 1;
      gl.texParameterf(gl.TEXTURE_2D, anisotropy.TEXTURE_MAX_ANISOTROPY_EXT, Math.min(4, max));
    }
    const finalError = gl.getError();
    if (finalError !== gl.NO_ERROR) throw new Error(`Texture setup failed with GL error 0x${finalError.toString(16)}`);
    gl.bindTexture(gl.TEXTURE_2D, null);
    return texture;
  } catch (error) {
    gl.bindTexture(gl.TEXTURE_2D, null);
    gl.deleteTexture(texture);
    const securityError = error instanceof Error && error.name === 'SecurityError';
    throw new D20Error(
      'TEXTURE_UPLOAD_FAILED',
      securityError
        ? 'The skin image is cross-origin without CORS permission and cannot be used as a texture'
        : 'Uploading the skin texture to the GPU failed',
      { cause: error },
    );
  }
}

function createProgram(gl: WebGL2RenderingContext): WebGLProgram {
  const vertex = compileShader(gl, gl.VERTEX_SHADER, VERTEX_SHADER);
  const fragment = compileShader(gl, gl.FRAGMENT_SHADER, FRAGMENT_SHADER);
  const program = gl.createProgram();
  if (!program) throw new D20Error('WEBGL_UNAVAILABLE', 'Could not create a WebGL program');
  gl.attachShader(program, vertex);
  gl.attachShader(program, fragment);
  gl.linkProgram(program);
  gl.deleteShader(vertex);
  gl.deleteShader(fragment);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS) && !gl.isContextLost()) {
    const log = gl.getProgramInfoLog(program);
    gl.deleteProgram(program);
    throw new D20Error('WEBGL_UNAVAILABLE', `Linking the die shaders failed: ${log ?? 'unknown error'}`);
  }
  return program;
}

function compileShader(gl: WebGL2RenderingContext, type: number, source: string): WebGLShader {
  const shader = gl.createShader(type);
  if (!shader) throw new D20Error('WEBGL_UNAVAILABLE', 'Could not create a WebGL shader');
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS) && !gl.isContextLost()) {
    const log = gl.getShaderInfoLog(shader);
    gl.deleteShader(shader);
    throw new D20Error('WEBGL_UNAVAILABLE', `Compiling the die shaders failed: ${log ?? 'unknown error'}`);
  }
  return shader;
}
