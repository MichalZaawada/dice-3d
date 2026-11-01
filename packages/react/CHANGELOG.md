# Changelog — dice-3d-react

## Unreleased

- `<DieView type value …>` for every `@ticone_marsicano/dice-3d` die type and custom definitions; changing
  `type` disposes the die and creates one new instance. `<D20View>` is unchanged (both share
  one implementation).

## 0.0.1 — 2026-11-01

Initial release: `<D20View>` with `value`, `motion`, `theme`, `skin`, `maxPixelRatio`,
`className`, `style`, `onError` and a ref handle (`rollTo`, `orientTo`, `getSnapshot`).
Strict Mode safe and renders an empty container on the server.
