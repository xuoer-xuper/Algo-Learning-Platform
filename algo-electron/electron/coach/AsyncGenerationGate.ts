/** Invalidates async work by accepting results only from the latest generation. */
export class AsyncGenerationGate {
  private generation = 0

  next(): number {
    this.generation += 1
    return this.generation
  }

  isCurrent(generation: number): boolean {
    return generation === this.generation
  }

  commit(generation: number, apply: () => void): boolean {
    if (!this.isCurrent(generation)) return false
    apply()
    return true
  }
}
