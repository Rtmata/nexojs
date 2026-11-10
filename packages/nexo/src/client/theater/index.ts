/**
 * theater: motion for Nexo (Phase 6). Every piece has its own path
 * (`@nexoamigos/nexo/theater/speed`); this index only lists them (A.1b).
 * There is no `theater()`: nothing to start, only pieces (G.3b).
 */
export { animate } from './animate'
export type { AnimateOptions, Keyframes, Targets } from './animate'
export type { Playback, ValueTarget } from './playback'
export { reducedMotion } from './reduce'
export { setSpeed, speedOf, SPEED_PROPERTY } from './speed'
export * from '../../shared/theater/easing/index'
