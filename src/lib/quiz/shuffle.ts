/** A source of numbers in [0, 1), `Math.random` by default; tests pass a seeded one. */
export type Rng = () => number;

/** A Fisher-Yates shuffled copy. */
export function shuffle<T>(items: readonly T[], rng: Rng = Math.random): T[] {
  const result = [...items];

  for (let index = result.length - 1; index > 0; index -= 1) {
    const swap = Math.floor(rng() * (index + 1));

    [result[index], result[swap]] = [result[swap], result[index]];
  }

  return result;
}
