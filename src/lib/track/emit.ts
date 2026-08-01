/**
 * Fire a named analytics event from anywhere in the UI.
 * The tracker island listens for these; if it isn't mounted (DNT,
 * no-JS, or tracker disabled) the event just evaporates - calling
 * this is always safe.
 */
export function emitTrack(type: string, meta: Record<string, unknown> = {}): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent('sa:track', { detail: { type, meta } }));
}
