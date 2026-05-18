// ── SYNC ADAPTER INTERFACE ─────────────────────────────────────────────
// Pluggable sync layer. The NullAdapter (in packages/adapter-null) is the
// default — it returns empty results so the core works fully offline.

export abstract class SyncAdapter {
  async pull(_checkpoint: unknown): Promise<{ records: Record<string, unknown[]>; checkpoint: unknown }> {
    return { records: {}, checkpoint: null };
  }
  async push(_changes: Record<string, unknown[]>): Promise<{ conflicts: unknown[] }> {
    return { conflicts: [] };
  }
  stream(_onRemoteChange: (changes: Record<string, unknown[]>) => void): () => void {
    return () => {};
  }
  async clear(): Promise<void> {}
}
