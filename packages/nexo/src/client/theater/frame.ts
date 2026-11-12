/**
 * The three moments of a frame, in order: read the page (sizes,
 * positions), compute, then write. Reads before writes, so a frame never
 * makes the browser lay the page out twice (Motion's frameloop does the
 * same, with more steps).
 */
export type Phase = 'read' | 'update' | 'render'

/** What a job learns each frame: the time, and how long since the last. */
export interface FrameTime {
  /** The frame's timestamp, in ms (`requestAnimationFrame`'s). */
  now: number
  /** Since the last frame, in ms: at least 1, at most 40. */
  delta: number
}

export type Job = (time: FrameTime) => void

/** Where frames come from: `requestAnimationFrame`, or a test's own. */
export interface FrameSource {
  request(callback: (now: number) => void): void
}

const PHASES: Phase[] = ['read', 'update', 'render']
/** A tab coming back from the background doesn't jump (Motion's 40 ms). */
const LONGEST_DELTA = 40
/** The first frame after a pause pretends one 60 Hz frame went by. */
const FIRST_DELTA = 1000 / 60

/**
 * One `requestAnimationFrame` for everything theater runs itself (values
 * only): jobs run every frame, phase by phase, until their
 * signal aborts. It sleeps while no job is left. An error in a job is
 * reported and the others keep going.
 *
 *   frames().every('update', ({ delta }) => step(delta), { signal })
 */
export class FrameLoop {
  private readonly jobs = new Map<Phase, Set<Job>>(
    PHASES.map((phase) => [phase, new Set()]),
  )
  private last: number | null = null
  private awake = false

  constructor(private readonly source: FrameSource) {}

  /** Runs `job` in `phase` of every frame until `signal` aborts. */
  every(phase: Phase, job: Job, options: { signal: AbortSignal }): void {
    if (options.signal.aborted) return
    this.jobs.get(phase)!.add(job)
    const stop = () => this.jobs.get(phase)!.delete(job)
    options.signal.addEventListener('abort', stop, { once: true })
    this.wake()
  }

  /** Runs `job` once, in `phase` of the next frame. */
  next(phase: Phase, job: Job): void {
    const once = new AbortController()
    const run: Job = (time) => (once.abort(), job(time))
    this.every(phase, run, { signal: once.signal })
  }

  /** How many jobs are waiting: none means the loop is asleep. */
  get size(): number {
    return PHASES.reduce((sum, phase) => sum + this.jobs.get(phase)!.size, 0)
  }

  private wake(): void {
    if (this.awake) return
    this.awake = true
    this.source.request((now) => this.frame(now))
  }

  private frame(now: number): void {
    const time = { now, delta: this.deltaTo(now) }
    for (const phase of PHASES) this.run(phase, time)
    this.awake = false
    if (this.size > 0) this.wake()
    else this.last = null
  }

  private deltaTo(now: number): number {
    const last = this.last
    this.last = now
    if (last === null) return FIRST_DELTA
    return Math.min(Math.max(now - last, 1), LONGEST_DELTA)
  }

  private run(phase: Phase, time: FrameTime): void {
    for (const job of [...this.jobs.get(phase)!]) {
      try {
        job(time)
      } catch (error) {
        reportError(error)
      }
    }
  }
}

/** The page's frames: `requestAnimationFrame`. */
const animationFrames: FrameSource = {
  request: (callback) => requestAnimationFrame(callback),
}

/** Module-level on purpose: one loop per page, made on first use. */
let shared: FrameLoop | null = null

/**
 * The page's frame loop, made the first time something asks (never at
 * import). Only in a browser: elsewhere there are no frames, and saying
 * so beats a loop that silently never runs.
 */
export function frames(): FrameLoop {
  if (typeof requestAnimationFrame === 'undefined') {
    throw new Error(
      'theater: the frame loop needs a browser (requestAnimationFrame); test values with a FrameLoop over your own FrameSource',
    )
  }
  shared ??= new FrameLoop(animationFrames)
  return shared
}
