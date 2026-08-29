/**
 * Display order and labels for note types on the /brain index.
 *
 * Split out of brain.ts so the markdown twins can order their note lists the
 * same way without dragging node:fs, gray-matter, and the whole remark
 * pipeline into the serverless bundle for one array.
 */
export const NOTE_TYPES = [
  { type: 'moc', label: 'Maps of content' },
  { type: 'meta', label: 'Meta' },
  { type: 'decision', label: 'Decisions' },
  { type: 'feature', label: 'Features' },
  { type: 'design', label: 'Design' },
  { type: 'phase', label: 'Phases' },
] as const;
