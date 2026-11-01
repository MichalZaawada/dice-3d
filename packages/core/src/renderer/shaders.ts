export const VERTEX_SHADER = /* glsl */ `#version 300 es
layout(location = 0) in vec3 aPosition;
layout(location = 1) in vec3 aNormal;
layout(location = 2) in vec3 aBarycentric;
layout(location = 3) in vec2 aLabelLocal;
layout(location = 4) in vec2 aLabelCell;
layout(location = 5) in vec2 aSkinUV;

uniform mat4 uModel;
uniform mat4 uViewProjection;

out vec3 vNormal;
out vec3 vBarycentric;
out vec2 vLabelLocal;
flat out vec2 vLabelCell;
out vec2 vSkinUV;

void main() {
  vNormal = mat3(uModel) * aNormal;
  vBarycentric = aBarycentric;
  vLabelLocal = aLabelLocal;
  vLabelCell = aLabelCell;
  vSkinUV = aSkinUV;
  gl_Position = uViewProjection * uModel * vec4(aPosition, 1.0);
}
`;

export const FRAGMENT_SHADER = /* glsl */ `#version 300 es
precision highp float;

in vec3 vNormal;
in vec3 vBarycentric;
in vec2 vLabelLocal;
flat in vec2 vLabelCell;
in vec2 vSkinUV;

uniform vec3 uBodyColor;
uniform vec3 uEdgeColor;
uniform vec3 uNumberColor;
uniform vec3 uLightDirection;
uniform float uUseSkin;
uniform float uShowNumbers;
uniform float uEdgeWidth;
uniform vec2 uAtlasGrid;
uniform sampler2D uSkin;
uniform sampler2D uNumbers;

out vec4 outColor;

vec3 encodeSrgb(vec3 linear) {
  vec3 low = linear * 12.92;
  vec3 high = 1.055 * pow(linear, vec3(1.0 / 2.4)) - 0.055;
  return mix(low, high, step(vec3(0.0031308), linear));
}

void main() {
  vec3 normal = normalize(vNormal);
  float diffuse = max(dot(normal, uLightDirection), 0.0);

  // Skin texels are sRGB (decoded by the texture format) and composited over the body color.
  vec4 skin = texture(uSkin, vSkinUV);
  vec3 base = mix(uBodyColor, mix(uBodyColor, skin.rgb, skin.a), uUseSkin);
  vec3 color = base * (0.38 + 0.72 * diffuse);

  // Numbers are part of the face shading (no decal geometry, hence no z-fighting).
  vec2 local = clamp(vLabelLocal, 0.0, 1.0);
  float inside = step(0.0, vLabelLocal.x) * step(vLabelLocal.x, 1.0) * step(0.0, vLabelLocal.y) * step(vLabelLocal.y, 1.0);
  float distance = texture(uNumbers, (vLabelCell + local) / uAtlasGrid).r;
  float smoothing = max(fwidth(distance) * 0.75, 0.002);
  float ink = smoothstep(0.5 - smoothing, 0.5 + smoothing, distance) * inside * uShowNumbers;
  color = mix(color, uNumberColor * (0.7 + 0.4 * diffuse), ink);

  // Edges from barycentric distance; width is expressed in device pixels.
  vec3 pixelWidth = fwidth(vBarycentric);
  vec3 edgeFactor = smoothstep(pixelWidth * (uEdgeWidth - 0.75), pixelWidth * (uEdgeWidth + 0.75), vBarycentric);
  float edge = 1.0 - min(min(edgeFactor.x, edgeFactor.y), edgeFactor.z);
  color = mix(color, uEdgeColor * (0.55 + 0.55 * diffuse), edge);

  outColor = vec4(encodeSrgb(color), 1.0);
}
`;
