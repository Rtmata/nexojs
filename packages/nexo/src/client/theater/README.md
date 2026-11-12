# theater

Motion for Nexo: one `animate` for elements and values, springs, sequences, scroll, layout moves, drag and pinch, with the page's speed and reduced motion built in. There is no `theater()`: nothing to start, only pieces.

## At a glance

```ts
import { animate, inView, stagger, tween } from '@nexoamigos/nexo/theater'

const controller = new AbortController()
const { signal } = controller

// An element runs on the browser's own animations (WAAPI)
animate(
  cover,
  { opacity: [0, 1], translate: ['0 24px', '0 0'] },
  { spring: { bounce: 0.2 }, signal },
)

// A list, one after another from the middle
animate(
  covers,
  { opacity: [0, 1] },
  { delay: stagger(50, { from: 'center' }), signal },
)

// A number runs on theater's frame loop and is written where you say
animate([0, 1200], (n) => (count.textContent = String(Math.round(n))), {
  duration: 800,
  signal,
})

// Each visit to the viewport gets its own signal: what it started stops when it leaves
inView(
  shelf,
  (entry, visit) => {
    animate(
      shelf,
      { scale: [1, 1.02] },
      { iterations: Infinity, direction: 'alternate', signal: visit.signal },
    )
  },
  { amount: 0.3, signal },
)

// A value that lives over time: each set() animates from wherever it is now
const size = tween(cover, { scale: 1 }, { spring: { duration: 300 } })
cover.onpointerenter = () => size.set({ scale: 1.05 })
cover.onpointerleave = () => size.set({ scale: 1 })

// Leaving the page: everything above stops where it is
controller.abort()
```

## Setup

Every piece has its own import path, so you load only what you use: `@nexoamigos/nexo/theater/animate`, `@nexoamigos/nexo/theater/scroll`, … The index `@nexoamigos/nexo/theater` lists them all. Two pieces run beside the browser in a Playwright test and are imported by their own paths only: `@nexoamigos/nexo/theater/test-clock` and `@nexoamigos/nexo/theater/flashes`.

Every piece takes a `signal`: aborting it stops what the piece started. Nothing runs at import.

## animate

`animate(targets, keyframes, options)` is a journey from A to B. It returns the shape of WAAPI's `Animation` (`play`, `pause`, `reverse`, `finish`, `cancel`, `currentTime`, `playbackRate`, `finished`) on both engines.

- **The target decides the clock.** An element, or a list of them (`NodeList`, array), runs on WAAPI: transforms and opacity on the compositor, and `getAnimations()` sees it, so omino's exits and bridge's leaves wait for it. A value (a list of numbers and a function, or anything with `set`, such as a signal) runs on theater's own `requestAnimationFrame` loop. The curve is the same on both.
- **Keyframes** are WAAPI's two native forms: a property-indexed object (`{ opacity: [0, 1] }`) or a list of frames. There are no selector strings: write the `querySelectorAll` line yourself.
- **Options:** `duration` (ms, 300), `delay` (ms, or `stagger(…)` on a list), `easing` (a CSS string or a function, `ease`), `spring`, `iterations`, `direction`, `composite`, `reduce`, `signal`.
- **What you see stays.** On finish the last value is written inline and the WAAPI animation retired; on abort it stays where it was; only `cancel()` goes back to the start. Inline values beat class rules: remove them (`style.removeProperty`) when a class should rule again.

## tween

`tween(target, initial, options)` is a value that lives over time. Each `set(next)` is exactly `animate` from where it is now to `next`, and returns that animation. A spring keeps the speed it had, so a new target in the middle doesn't jolt. `follow(source, options)` is a signal that follows another through a tween: the one piece that uses connector.

## Curves: easings and springs

- `easing` takes any CSS easing (`'ease-out'`, `cubic-bezier(…)`, `steps(…)`, `linear(…)`) or a function `t → t`. The families `backIn`/`backOut`/`backInOut`, `bounce…`, `circ…`, `cubic…`, `elastic…`, `expo…`, `quad…`, `quart…`, `quint…`, `sine…` are Robert Penner's, with the same values as Svelte's; `out(fn)` and `inOut(fn)` build the other forms of your own. A function easing is sampled into CSS `linear()` for WAAPI.
- `spring` is either how it looks, `{ duration, bounce }` (500 ms and no bounce by default, as SwiftUI's), or how it's built, `{ stiffness, damping, mass }`. Both run the same oscillator, and its duration is computed.
- `inertia` (on values; elements get it through `drag`) is a fling from a `velocity`, with `power`, `timeConstant`, `bounds` that spring back at the `edge`, and `snap` points.

## Sequences

`animate([segment, segment, …], { signal })` plays segments one after another. A segment is `[targets, keyframes, options]`, `[numbers, fn, options]` or a nested sequence; a string is a label.

- With no position, a segment starts when the one before it ends.
- `with: 'previous'` starts it together with the one before; `with: '<label>'` at the label.
- `delay` shifts it from that place (negative: earlier); `at` is an absolute time.
- The whole sequence pauses, seeks, reverses and settles as one.

## Speed and reduced motion

- **Speed** is one inherited CSS custom property, `--theater-speed`. `setSpeed(document.documentElement, 0.5)` makes everything below half as fast; `speedOf(el)` reads it. Durations are divided by it, in theater, in bridge's view changes, and in your CSS: `transition: opacity calc(300ms / var(--theater-speed, 1))`.
- **Reduced motion** follows WCAG 2.3.3: under `prefers-reduced-motion: reduce`, what moves (translate, scale, rotate, position, size, blur) jumps to its end; opacity and colour still animate. `reduce: false` marks an essential animation; `reduce: 'jump'` makes a whole animation jump, such as a value that moves something. `reducedMotion()` reads the preference now.
- `finished(el, { name, subtree, signal })` waits for an element's CSS and WAAPI animations to end. An endless one (a spinner) is not waited for unless it is the one `name`d.

## Scroll and view

- `scroll(animation, { source, subject, axis, rangeStart, rangeEnd, signal })` links an animation, or a function of progress, to a scroll. Elements use the browser's `ScrollTimeline` / `ViewTimeline` where there is one; elsewhere a listener does the same.
- `inView(el, (entry, { signal }) => …, { root, margin, amount, once, signal })` runs once per visit, with a signal that aborts when the element leaves.
- `parallax(el, { depth, axis, signal })` is exactly a `scroll` of a `translate`. Under reduced motion there is no parallax.
- `scrollTo(target, { offset, container, axis, …animate options })` scrolls with theater's curve, and jumps under reduced motion.
- `smoothWheel({ signal, prevent, smoothing })` smooths the vertical mouse wheel only; touch, keys, scrollbars and anchors stay native. It is off unless you turn it on.

## Layout and shared elements

- `measure(elements)`, your change, then `flip(before, options)` animates elements from where they were to where they are, even when the change happens elsewhere (an omino render, a bridge swap). `layout(elements, update, options)` does the three in one call.
- `moves(options)` is the row mover for omino's `<For move={…}>`: omino calls it, and never imports theater.
- `animateView(change, options)` shows a change as a View Transition, with theater's curve and the page's speed. Shared elements are the ones with the same CSS `view-transition-name`; where there are no View Transitions they FLIP instead.

## Drag and pinch

- `drag(el, { axis, bounds, elastic, release, signal })` follows the pointer through `translate`, stretches past its bounds, and on release keeps the pointer's real speed (inertia with snap) or springs back. A press that hardly moves stays a click.
- `pinch(el, { scale, rotate, pan, elastic, release, signal })` zooms, turns and moves with two fingers or a trackpad.
- Both return `set(…)`: give every drag and pinch a way without them, such as buttons (WCAG 2.5.7).

## Testing motion

- `testClock(page)` (Playwright) drives both engines with one clock: `await clock.advance(200)` moves CSS animations, WAAPI animations and theater's frame loop together, so a test sees an exact frame.
- `flashes(page, { seconds, clock })` captures the page's real frames on that clock and counts them by WCAG 2.3.1, region by region: `report.failures` should be empty. `predictFlashes()` gives the same check, predicted from the running animations' keyframes, cheap enough for development; it can't see images, video or canvas.

## Why it works this way

- **One curve, two clocks.** An animation is a curve over time; the target only decides who advances it. Elements stay on WAAPI, so the browser runs them off the main thread and every other module can wait for them. Values need a frame loop, since WAAPI can't write a number or a signal. Doing everything in our own loop would put elements on the main thread and hide them from `getAnimations()`; doing everything in WAAPI would leave numbers, signals and canvas out.
- **WAAPI's shape everywhere.** You learn the platform's `Animation` once; theater adds springs, speed and reduced motion in `options`, not a new object model.
- **A journey and a living value are both needed.** `animate` composes (sequences, scroll, seek); `tween` retargets (hover, pointer, drag release). `tween` has no rule of its own: it remembers where it is and calls `animate`.
- **Speed is CSS's.** A custom property reaches CSS transitions, theater and bridge alike, and a subtree can have its own. A JS-only setting would leave the site's CSS at another speed.
- **Reduced motion is on by default, by WCAG's definition.** Nothing automatic means an `if` in every animation, and forgetting it fails WCAG; skipping everything would remove fades WCAG allows.
- **What you see stays.** WAAPI's default snaps back on finish, and `fill: 'forwards'` piles animations up and blocks later style changes; writing the end value and retiring the animation avoids both.
- **Tests run on a clock you control.** Playwright's clock alone doesn't move CSS or WAAPI animations, so they would run in real time and tests would flake; a clock option on every animation would put a test-only parameter in the public API.
- **Flashes are checked two ways.** Predicting from keyframes is cheap but blind to images and video; measuring frames sees everything but only what tests cover. Both feed one WCAG counter.
