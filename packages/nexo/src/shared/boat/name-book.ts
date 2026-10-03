import type { Variants } from './route'

/**
 * Route names and their paths, so links can be built by name. One name,
 * one set of paths: GET and POST may share a name if their paths agree.
 */
export class NameBook {
  private readonly names = new Map<string, Variants>()

  private readonly methods = new Map<string, Set<string>>()

  get(name: string): Variants | undefined {
    return this.names.get(name)
  }

  /** The paths of a name that must exist: a clear error otherwise. */
  require(name: string): Variants {
    const variants = this.names.get(name)
    if (variants) return variants
    throw new Error(
      `boat: there is no route named "${name}". Register it, e.g. router.get('${name}', '/path', handler)`,
    )
  }

  /** Whether the name answers this method (a redirect needs a GET). */
  answers(name: string, method: string): boolean {
    return this.methods.get(name)?.has(method) ?? false
  }

  /** Record that the name answers one more method. */
  addMethod(name: string, method: string): void {
    const methods = this.methods.get(name) ?? new Set<string>()
    this.methods.set(name, methods.add(method))
  }

  has(name: string): boolean {
    return this.names.has(name)
  }

  /**
   * Whether registering `name` with these paths adds a new name. Throws when
   * the name is already taken by other paths. Stores nothing.
   */
  isNew(name: string, variants: Variants): boolean {
    const known = this.names.get(name)
    if (known && !known.sameAs(variants)) {
      throw new Error(
        `boat: two different routes are named "${name}". Give one of them another name`,
      )
    }
    return !known
  }

  add(name: string, variants: Variants): void {
    this.names.set(name, variants)
  }
}
