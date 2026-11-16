/** Finds a cycle in a prerequisite graph (`id -> ids that must come first`). Returns the cycle's path, or null. */
export function findPrerequisiteCycle(
  graph: ReadonlyMap<string, readonly string[]>,
): string[] | null {
  const WHITE = 0,
    GREY = 1,
    BLACK = 2;
  const colour = new Map<string, number>();
  const path: string[] = [];

  const visit = (node: string): string[] | null => {
    colour.set(node, GREY);
    path.push(node);
    for (const next of graph.get(node) ?? []) {
      const state = colour.get(next) ?? WHITE;
      if (state === GREY) return [...path.slice(path.indexOf(next)), next];
      if (state === WHITE) {
        const found = visit(next);
        if (found) return found;
      }
    }
    path.pop();
    colour.set(node, BLACK);
    return null;
  };

  for (const node of graph.keys()) {
    if ((colour.get(node) ?? WHITE) === WHITE) {
      const found = visit(node);
      if (found) return found;
    }
  }
  return null;
}

/**
 * Re-expresses a cycle (`[a, b, c, a]`) so it starts, and ends, at `start`. The search may find the same
 * loop beginning anywhere; reporting it from the entry being edited is stable and tells the user what to fix.
 */
export function rotateCycleTo(
  cycle: readonly string[],
  start: string,
): string[] {
  const loop = cycle.slice(0, -1);
  const at = loop.indexOf(start);
  if (at === -1) return [...cycle];
  const rotated = [...loop.slice(at), ...loop.slice(0, at)];
  return [...rotated, start];
}
