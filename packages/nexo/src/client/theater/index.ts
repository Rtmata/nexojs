/**
 * theater: motion for Nexo (Phase 6). Every piece has its own path
 * (`@nexoamigos/nexo/theater/speed`); this index only lists them (A.1b).
 * There is no `theater()`: nothing to start, only pieces (G.3b).
 */
export { animate } from './animate'
export type {
  AnimateOptions,
  Keyframes,
  Segment,
  SegmentOptions,
  SequenceItem,
  SequenceOptions,
  Targets,
} from './animate'
export type { Playback, ValueTarget } from './playback'
export { inView } from './in-view'
export type { InViewOptions, Visit } from './in-view'
export { drag } from './drag'
export type { Bounds, Draggable, DragOptions } from './drag'
export { finished } from './finished'
export { follow } from './follow'
export type { FinishedOptions } from './finished'
export { predictFlashes } from './flashes'
export type { PredictedFlash } from './flashes'
export { flip, layout, measure, moves } from './layout'
export type { Measured, MoveFn } from './layout'
export { parallax } from './parallax'
export { pinch } from './pinch'
export type { Pinchable, PinchOptions } from './pinch'
export type { ParallaxOptions } from './parallax'
export { reducedMotion } from './reduce'
export { scroll } from './scroll'
export { scrollTo } from './scroll-to'
export type { ScrollToOptions } from './scroll-to'
export { smoothWheel } from './smooth-wheel'
export type { SmoothWheelOptions } from './smooth-wheel'
export type { ScrollAxis, ScrollOptions } from './scroll'
export { tween } from './tween'
export { animateView } from './view'
export type { ViewChange } from './view'
export type { Styles, Tween } from './tween'
export { setSpeed, speedOf, SPEED_PROPERTY } from './speed'
export { stagger } from '../../shared/theater/stagger'
export type { StaggerDelay, StaggerOptions } from '../../shared/theater/stagger'
export type { Sequence } from './sequence'
export * from '../../shared/theater/easing/index'
