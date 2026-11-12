import { noteCall } from './recipe-calls'
import type {
  CheckedVariants,
  Recipe,
  RecipeConfig,
  Vars,
  VarReads,
} from './recipe-types'
import { sheet } from './sheet'
import {
  blockLines,
  propertyName,
  ruleLines,
  valueText,
  type StyleObject,
} from './style-block'
import { CSS_NAME } from './token-group'

/**
 * A component's look: vars with defaults, a base that reads them,
 * variants that only change vars, compound variants and parts. Calling it
 * gives readable classes, every variant as group + value; it is also
 * the sheet a `styles` list names, in `glyph.recipes`, base below
 * variants so a variant wins without specificity.
 *
 *   const button = recipe('button', {
 *     vars: { bg: tokens.color.surface, pad: tokens.space.s },
 *     base: (v) => ({ background: v.bg, padding: v.pad, '&:hover': { filter: 'brightness(1.1)' } }),
 *     variants: { intent: { primary: { bg: tokens.color.primary }, ghost: { bg: 'transparent' } } },
 *     defaultVariants: { intent: 'primary' },
 *   })
 *   button()                     // 'button button--intent-primary'
 *   static styles = [tokens, button]
 */
export function recipe<
  const V extends Vars,
  const G extends CheckedVariants<G, V> = {},
  const P = {},
>(name: string, config: RecipeConfig<V, G, P>): Recipe<G, P> {
  const definition = new RecipeDefinition(
    name,
    config as unknown as RecipeParts,
  )
  return callable(definition) as unknown as Recipe<G, P>
}

/** The function a recipe is: called, it gives classes; it also carries its sheet's `name` and `css`. */
function callable(definition: RecipeDefinition): object {
  const own = definition.sheet()
  const call = (choice: Record<string, string> = {}) => {
    noteCall(own.name)
    return definition.classes(choice)
  }
  Object.defineProperties(call, {
    name: { value: own.name, enumerable: true },
    css: { value: own.css, enumerable: true },
  })
  return Object.freeze(call)
}

/** The config as glyph reads it, past the types that check it. */
interface RecipeParts {
  readonly vars: Vars
  readonly base: (vars: VarReads<Vars>) => StyleObject
  readonly variants?: Readonly<
    Record<string, Readonly<Record<string, StyleObject>>>
  >
  readonly defaultVariants?: Readonly<Record<string, string>>
  readonly when?: readonly (Readonly<Record<string, string>> & {
    readonly set: StyleObject
  })[]
  readonly parts?: Readonly<
    Record<string, (vars: VarReads<Vars>) => StyleObject>
  >
}

/** One recipe, checked once: its CSS and the classes for each call. */
class RecipeDefinition {
  private readonly variants: Readonly<
    Record<string, Readonly<Record<string, StyleObject>>>
  >
  private readonly defaults: Readonly<Record<string, string>>

  constructor(
    private readonly name: string,
    private readonly config: RecipeParts,
  ) {
    this.variants = config.variants ?? {}
    this.defaults = config.defaultVariants ?? {}
    this.checkNames()
  }

  sheet() {
    const base = ruleLines('@layer base', this.baseLines())
    const variants = this.variantLines()
    const above =
      variants.length > 0 ? ruleLines('@layer variants', variants) : []
    const layers = ['@layer base, variants;', ...base, ...above]
    const name = `glyph.recipes(${this.name})`
    return sheet(name, 'glyph.recipes', layers.join('\n'))
  }

  /** The root's classes, every group with its value; with parts, one class each too. */
  classes(choice: Record<string, string>): string | Record<string, string> {
    for (const group of Object.keys(choice)) this.ensureGroup(group)
    const root = [this.name, ...this.chosenClasses(choice)].join(' ')
    const parts = Object.keys(this.config.parts ?? {})
    if (parts.length === 0) return root
    const partClasses = parts.map((p) => [p, `${this.name}__${p}`])
    return Object.freeze({ root, ...Object.fromEntries(partClasses) })
  }

  /** Each group's class: the value asked for, else its default, else none. */
  private chosenClasses(choice: Record<string, string>): string[] {
    return Object.keys(this.variants).flatMap((group) => {
      const value = choice[group] ?? this.defaults[group]
      return value === undefined
        ? []
        : [this.variantClass(group, this.ensureValue(group, value))]
    })
  }

  /** The vars with their defaults, the base, then each part. */
  private baseLines(): string[] {
    const reads = this.reads()
    const defaults = this.defaultLines()
    const base = this.styleLines(this.config.base(reads), 'base')
    const root = ruleLines(`.${this.name}`, [...defaults, ...base])
    return [...root, ...this.partLines(reads)]
  }

  /** Each part's rule, reading the root's vars by inheritance. */
  private partLines(reads: VarReads<Vars>): string[] {
    return Object.entries(this.config.parts ?? {}).flatMap(([part, style]) =>
      ruleLines(
        `.${this.name}__${part}`,
        this.styleLines(style(reads), `parts.${part}`),
      ),
    )
  }

  /** Each var as the `var()` that reads it: what `base` and parts get. */
  private reads(): VarReads<Vars> {
    const vars = Object.keys(this.config.vars)
    const reads = vars.map((v) => [v, `var(${this.varProperty(v)})`])
    return Object.fromEntries(reads) as VarReads<Vars>
  }

  /** Each var's custom property with its default. */
  private defaultLines(): string[] {
    const where = `recipe "${this.name}" vars`
    return Object.entries(this.config.vars).map(
      ([v, value]) =>
        `${this.varProperty(v)}: ${valueText(value, `${where}.${v}`)};`,
    )
  }

  /** A style's lines, its properties as CSS writes them; `at` names it in errors. */
  private styleLines(style: StyleObject, at: string): string[] {
    const where = `recipe "${this.name}" ${at}`
    return blockLines(style, propertyName(where), where)
  }

  /** Each variant, then each `when` after them: a compound is more specific and comes later. */
  private variantLines(): string[] {
    const single = Object.entries(this.variants).flatMap(([group, values]) =>
      Object.entries(values).flatMap(([value, set]) =>
        this.valueLines(group, value, set),
      ),
    )
    const compound = (this.config.when ?? []).flatMap(({ set, ...choice }, i) =>
      ruleLines(this.whenSelector(choice, i), this.varLines(set, `when[${i}]`)),
    )
    return [...single, ...compound]
  }

  /** One variant value's rule; a value that keeps every default writes none: its class still says it applies. */
  private valueLines(group: string, value: string, set: StyleObject): string[] {
    const lines = this.varLines(set, `variants.${group}.${value}`)
    if (lines.length === 0) return []
    return ruleLines(`.${this.variantClass(group, value)}`, lines)
  }

  private whenSelector(choice: Record<string, string>, i: number): string {
    const classes = Object.entries(choice).map(
      ([group, value]) =>
        `.${this.variantClass(group, this.ensureValue(this.ensureGroup(group), value))}`,
    )
    if (classes.length === 0)
      throw new Error(
        `glyph: recipe "${this.name}" when[${i}]: name the groups' values it applies to`,
      )
    return classes.join('')
  }

  /** A variant writes vars only, by their custom property. */
  private varLines(set: StyleObject, at: string): string[] {
    const where = `recipe "${this.name}" ${at}`
    const name = (key: string) => {
      if (Object.hasOwn(this.config.vars, key)) return this.varProperty(key)
      throw new Error(
        `glyph: ${where}: "${key}" is not a var of this recipe; a variant changes vars only`,
      )
    }
    return blockLines(set, name, where)
  }

  private varProperty(v: string): string {
    return `--${this.name}-${v}`
  }

  private variantClass(group: string, value: string): string {
    return `${this.name}--${group}-${value}`
  }

  private ensureGroup(group: string): string {
    if (Object.hasOwn(this.variants, group)) return group
    throw new Error(
      `glyph: recipe "${this.name}": no variant group "${group}"; its groups are ${Object.keys(this.variants).join(', ') || 'none'}`,
    )
  }

  private ensureValue(group: string, value: string): string {
    if (Object.hasOwn(this.variants[group]!, value)) return value
    throw new Error(
      `glyph: recipe "${this.name}": ${group} has no value "${value}"; it has ${Object.keys(this.variants[group]!).join(', ')}`,
    )
  }

  /**
   * Every name goes into a class or a custom property; `root` and `set` are
   * taken by the call's result and by `when`; two group-value pairs that
   * spell one class (`a-b` + `c`, `a` + `b-c`) would be one rule.
   */
  private checkNames(): void {
    this.checkCharacters()
    this.checkReserved()
    for (const [group, value] of Object.entries(this.defaults))
      this.ensureValue(this.ensureGroup(group), value)
    this.checkCollisions()
  }

  private checkCharacters(): void {
    const bad = this.allNames().find((n) => !CSS_NAME.test(n))
    if (bad === undefined) return
    throw this.mistake(
      `"${bad}" can't be part of a class or custom property name; use letters, digits, - and _`,
    )
  }

  /** Every name that goes into a class or a custom property. */
  private allNames(): string[] {
    const { vars, parts = {} } = this.config
    const groups = Object.entries(this.variants).flatMap(([g, values]) => [
      g,
      ...Object.keys(values),
    ])
    return [this.name, ...Object.keys(vars), ...Object.keys(parts), ...groups]
  }

  private checkReserved(): void {
    if (Object.hasOwn(this.config.parts ?? {}, 'root'))
      throw this.mistake(
        "a part can't be called root, the call's result keeps it for the root's classes",
      )
    if (Object.hasOwn(this.variants, 'set'))
      throw this.mistake(
        "a variant group can't be called set, when keeps it for the vars it sets",
      )
  }

  private checkCollisions(): void {
    const seen = new Map<string, string>()
    for (const [cls, label] of this.variantClasses()) {
      const before = seen.get(cls)
      if (before)
        throw this.mistake(
          `${before} and ${label} both make the class ${cls}; rename one`,
        )
      seen.set(cls, label)
    }
  }

  /** Each group-value pair's class, with the pair as written: `size.small`. */
  private variantClasses(): [string, string][] {
    return Object.entries(this.variants).flatMap(([group, values]) =>
      Object.keys(values).map((value): [string, string] => [
        this.variantClass(group, value),
        `${group}.${value}`,
      ]),
    )
  }

  private mistake(text: string): Error {
    return new Error(`glyph: recipe "${this.name}": ${text}`)
  }
}
