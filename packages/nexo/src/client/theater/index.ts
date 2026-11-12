/**
 * theater: motion for Nexo (Phase 6). Every piece has its own path
 * (`@nexoamigos/nexo/theater/speed`); this index only lists them.
 * There is no `theater()`: nothing to start, only pieces.
 * `flashes` and `test-clock` are left out: they run in a Playwright test,
 * beside the browser, and are imported by their own paths.
 */
export * from './pieces/animate'
export * from './pieces/animate-view'
export * from './pieces/drag'
export * from './pieces/easing'
export * from './pieces/finished'
export * from './pieces/follow'
export * from './pieces/in-view'
export * from './pieces/layout'
export * from './pieces/parallax'
export * from './pieces/pinch'
export * from './pieces/predict-flashes'
export * from './pieces/reduced-motion'
export * from './pieces/scroll'
export * from './pieces/scroll-to'
export * from './pieces/smooth-wheel'
export * from './pieces/speed'
export * from './pieces/stagger'
export * from './pieces/tween'
