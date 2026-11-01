import { invalidArgument } from '../errors.js';
import { customDieModel, resolveDieModel, type DieModel } from '../geometry/dice.js';
import { templateToSvg } from '../geometry/template.js';
import type { CustomDieDefinition, DieInfo, DieTemplate, DieType, DieValue, DieValueOf } from '../types.js';
import { templateOf } from './skinValidation.js';

const infos = new WeakMap<DieModel, DieInfo>();

export function dieInfo(model: DieModel): DieInfo {
  let info = infos.get(model);
  if (!info) {
    const check = (value: DieValue) => {
      if (!model.isValue(value)) throw invalidArgument(`value must be ${model.expected}`);
      return value;
    };
    info = Object.freeze({
      type: model.type,
      name: model.name,
      shape: model.shape,
      reading: model.reading,
      values: model.values,
      defaultValue: model.defaultValue,
      faces: Object.freeze(
        model.faces.map((face) => Object.freeze({ index: face.index, value: (face.value ?? null) as DieValue | null, label: face.text })),
      ),
      templateId: model.templateId,
      labelsFor: (value: DieValue) => Object.freeze([...model.labelsFor(check(value))]),
      format: (value: DieValue) => model.format(check(value)),
    });
    infos.set(model, info);
  }
  return info;
}

/** Documented values, labels, faces and template id of a built-in type or custom definition. Works on the server. */
export function getDieInfo<T extends DieType | CustomDieDefinition>(type: T): DieInfo<DieValueOf<T>> {
  return dieInfo(resolveDieModel(type)) as unknown as DieInfo<DieValueOf<T>>;
}

/** UV layout of the die's skin template (`info.templateId`). */
export function getDieTemplate(type: DieType | CustomDieDefinition): DieTemplate {
  return templateOf(resolveDieModel(type));
}

/** SVG artwork template for the die's grid layout (or the D20 net). */
export function createDieTemplateSvg(type: DieType | CustomDieDefinition): string {
  const model = resolveDieModel(type);
  return templateToSvg(templateOf(model), `dice-3d ${model.name} skin template`);
}

/**
 * Validates a custom die definition and returns a frozen copy. Pass the
 * result as `type` (keep the same object to share its mesh between instances).
 */
export function defineDie<const V extends DieValue>(definition: CustomDieDefinition<V>): CustomDieDefinition<V> {
  const copy = JSON.parse(JSON.stringify(definition)) as CustomDieDefinition<V>;
  customDieModel(copy);
  return deepFreeze(copy);
}

function deepFreeze<T>(value: T): T {
  if (typeof value === 'object' && value !== null && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) deepFreeze(child);
  }
  return value;
}
