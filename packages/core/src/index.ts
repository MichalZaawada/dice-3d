export { createD20, createDie } from './controller/createD20.js';
export { createDieTemplateSvg, defineDie, getDieInfo, getDieTemplate } from './controller/dieInfo.js';
export { D20Error, D20Error as DieError, isD20Error, isD20Error as isDieError, type D20ErrorCode } from './errors.js';
export { D20_NET_V1 } from './geometry/d20NetV1.js';
export { D20_DEFAULT_THEME } from './controller/validation.js';
export { D20_VALUES, isD20Value } from './geometry/d20.js';
export { DIE_SHAPES, DIE_TYPES, isDieType } from './geometry/dice.js';
export type {
  AnimationOptions,
  AnimationResult,
  CustomDieDefinition,
  D20,
  D20Options,
  D20Skin,
  D20SkinLayout,
  D20SkinSource,
  D20Snapshot,
  D20State,
  D20Theme,
  D20Value,
  Die,
  DieAnimationResult,
  DieFaceDefinition,
  DieFaceInfo,
  DieFaceLabel,
  DieInfo,
  DieOptions,
  DieRange,
  DieShape,
  DieSkin,
  DieSkinLayout,
  DieSnapshot,
  DieSymbol,
  DieTemplate,
  DieTemplateFace,
  DieTemplateLabel,
  DieType,
  DieValue,
  DieValueMap,
  DieValueOf,
  FaceUV,
  FaceUVPolygon,
  MotionMode,
  UV,
} from './types.js';
