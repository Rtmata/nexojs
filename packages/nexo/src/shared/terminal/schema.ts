/**
 * Standard Schema v1 (standardschema.dev): the interface, copied as types,
 * so any validator that meets it (Valibot, Zod, ArkType…) plugs in with no
 * dependency (R.24). Nexo's own small validators below meet it too.
 */
export interface StandardSchemaV1<Input = unknown, Output = Input> {
  readonly '~standard': {
    readonly version: 1
    readonly vendor: string
    readonly validate: (
      value: unknown,
    ) => Result<Output> | Promise<Result<Output>>
    readonly types?: { readonly input: Input; readonly output: Output }
  }
}

export type Result<Output> =
  | { readonly value: Output; readonly issues?: undefined }
  | { readonly issues: readonly Issue[] }

export interface Issue {
  readonly message: string
  readonly path?: readonly PropertyKey[]
}

/** What a schema gives once valid. */
export type Output<S> = S extends StandardSchemaV1<any, infer O> ? O : never

type Check<T> = (value: unknown, path: PropertyKey[]) => { value: T } | Issue[]

/** A schema from a check: what every validator here is. */
function schema<T>(check: Check<T>): StandardSchemaV1<T> {
  return {
    '~standard': {
      version: 1,
      vendor: 'nexo',
      validate: (value) => {
        const checked = check(value, [])
        return Array.isArray(checked) ? { issues: checked } : checked
      },
    },
  }
}

function checkOf<T>(s: StandardSchemaV1<T>): Check<T> {
  return (value, path) => {
    const result = s['~standard'].validate(value)
    if (result instanceof Promise)
      throw new Error('terminal: async schemas are not supported here')
    return result.issues
      ? result.issues.map((i) => ({ ...i, path: [...path, ...(i.path ?? [])] }))
      : { value: result.value }
  }
}

function fails(message: string, path: PropertyKey[]): Issue[] {
  return [{ message, path }]
}

/**
 * Trusted as is, no check (R.24): for transports whose other side already
 * validates (Tauri: Rust's types). Only the type.
 */
export function type<T>(): StandardSchemaV1<T> {
  return schema((value) => ({ value: value as T }))
}

export function string(): StandardSchemaV1<string> {
  return schema((v, path) =>
    typeof v === 'string' ? { value: v } : fails('expected a string', path),
  )
}

export function number(): StandardSchemaV1<number> {
  return schema((v, path) =>
    typeof v === 'number' && Number.isFinite(v)
      ? { value: v }
      : fails('expected a number', path),
  )
}

export function boolean(): StandardSchemaV1<boolean> {
  return schema((v, path) =>
    typeof v === 'boolean'
      ? { value: v }
      : fails('expected true or false', path),
  )
}

export function oneOf<const W extends string | number>(
  choices: readonly W[],
): StandardSchemaV1<W> {
  return schema((v, path) =>
    choices.includes(v as W)
      ? { value: v as W }
      : fails(`expected one of ${choices.join(', ')}`, path),
  )
}

/** Missing (`undefined`) is fine; anything else must pass `inner`. */
export function optional<T>(
  inner: StandardSchemaV1<T>,
): StandardSchemaV1<T | undefined> {
  const check: Check<T | undefined> = checkOf(inner)
  return schema((v, path) =>
    v === undefined ? { value: undefined } : check(v, path),
  )
}

export function nullable<T>(
  inner: StandardSchemaV1<T>,
): StandardSchemaV1<T | null> {
  const check: Check<T | null> = checkOf(inner)
  return schema((v, path) => (v === null ? { value: null } : check(v, path)))
}

export function array<T>(item: StandardSchemaV1<T>): StandardSchemaV1<T[]> {
  const check = checkOf(item)
  return schema((v, path) => {
    if (!Array.isArray(v)) return fails('expected a list', path)
    return collect(
      v.map((x, i) => [i, check(x, [...path, i])]),
      [] as T[],
    )
  })
}

type Shape = Record<string, StandardSchemaV1<any>>
/** A key whose schema accepts `undefined` is optional in the type too (`tags?:`). */
type OptionalKeys<S extends Shape> = {
  [K in keyof S]: undefined extends Output<S[K]> ? K : never
}[keyof S]
type ObjectOf<S extends Shape> = {
  [K in Exclude<keyof S, OptionalKeys<S>>]: Output<S[K]>
} & {
  [K in OptionalKeys<S>]?: Output<S[K]>
}

/** Only the keys it names: anything else is dropped, never passed on. */
export function object<S extends Shape>(
  shape: S,
): StandardSchemaV1<ObjectOf<S>> {
  const checks = Object.entries(shape).map(
    ([key, s]) => [key, checkOf(s)] as const,
  )
  return schema((v, path) => {
    if (!isRecord(v)) return fails('expected an object', path)
    const results = checks.map(
      ([key, check]) => [key, check(v[key], [...path, key])] as const,
    )
    return collect(results, {} as ObjectOf<S>)
  })
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

type Checked = { value: unknown } | Issue[]

/** Every part's issues kept; the value rebuilt from what passed (a missing optional stays missing). */
function collect<C>(
  results: readonly (readonly [PropertyKey, Checked])[],
  into: C,
): { value: C } | Issue[] {
  const issues: Issue[] = []
  for (const [key, checked] of results) {
    if (Array.isArray(checked)) issues.push(...checked)
    else if (checked.value !== undefined)
      (into as Record<PropertyKey, unknown>)[key] = checked.value
  }
  return issues.length > 0 ? issues : { value: into }
}

/** Validate now, or the issues; async schemas are refused (a command checks before it runs). */
export function check<T>(
  s: StandardSchemaV1<unknown, T>,
  value: unknown,
): Result<T> {
  const result = s['~standard'].validate(value)
  if (result instanceof Promise)
    throw new Error('terminal: async schemas are not supported')
  return result
}
