import { attach, detach, type Registry } from './attach'

/**
 * Opt-in (item 36): `attach` for DOM changed outside bridge. Started
 * explicitly, never at import; connects what's added, ends what's removed
 * (after the fact, so no exits). bridge's lifetimes stay the main path.
 */
export function observe(
  root: Element,
  registry: Registry,
  { signal }: { signal: AbortSignal },
): void {
  attach(root, registry, { signal })
  const observer = new MutationObserver((records) =>
    changed(records, registry, signal),
  )
  observer.observe(root, { childList: true, subtree: true })
  signal.addEventListener('abort', () => observer.disconnect(), { once: true })
}

function changed(
  records: MutationRecord[],
  registry: Registry,
  signal: AbortSignal,
): void {
  for (const record of records) {
    for (const node of record.removedNodes)
      if (node instanceof Element && !node.isConnected) detach(node)
    for (const node of record.addedNodes)
      if (node instanceof Element && node.isConnected)
        attach(node, registry, { signal })
  }
}
