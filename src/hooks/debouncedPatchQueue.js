export function createDebouncedPatchQueue({
  delay,
  persist,
  onError,
  schedule = setTimeout,
  cancel = clearTimeout,
}) {
  const pending = new Map();
  const timers = new Map();
  const inFlight = new Map();
  const inFlightPatches = new Map();

  const clearTimer = (id) => {
    const timer = timers.get(id);
    if (timer !== undefined) cancel(timer);
    timers.delete(id);
  };

  const flush = async (id) => {
    if (inFlight.has(id)) {
      await inFlight.get(id);
      return pending.has(id) ? flush(id) : null;
    }

    const patch = pending.get(id);
    if (!patch) return null;

    pending.delete(id);
    clearTimer(id);
    inFlightPatches.set(id, patch);
    const operation = (async () => {
      try {
        await persist(id, patch);
        return patch;
      } catch (error) {
        // Uma edição que chegou enquanto o request estava em voo tem prioridade
        // sobre o patch antigo; ambos permanecem pendentes para o próximo flush.
        pending.set(id, { ...patch, ...(pending.get(id) || {}) });
        onError?.(error, id);
        return null;
      } finally {
        inFlight.delete(id);
        inFlightPatches.delete(id);
      }
    })();
    inFlight.set(id, operation);
    return operation;
  };

  const enqueue = (id, patch) => {
    pending.set(id, { ...(pending.get(id) || {}), ...patch });
    clearTimer(id);
    timers.set(id, schedule(() => { void flush(id); }, delay));
  };

  const overlay = (id, serverValue) => ({
    ...serverValue,
    ...(inFlightPatches.get(id) || {}),
    ...(pending.get(id) || {}),
  });

  const flushAll = async () => {
    const ids = [...new Set([...pending.keys(), ...inFlight.keys()])];
    await Promise.all(ids.map((id) => flush(id)));
  };

  const discard = (id) => {
    clearTimer(id);
    pending.delete(id);
  };

  return {
    enqueue,
    flush,
    flushAll,
    discard,
    overlay,
    getPending: (id) => pending.get(id) || null,
  };
}
