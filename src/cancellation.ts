// One cancellation scope for the lifetime of a CLI invocation.
export const cancellation = new AbortController();
export const cancellationSignal: AbortSignal = cancellation.signal;

export function checkCancellation(): void {
  cancellationSignal.throwIfAborted();
}
