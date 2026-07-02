/**
 * Shared KC (Knowledge Component) utilities.
 * Replaces hardcoded getKcDisplayName() / getTaskRef() across the app.
 */

export interface KcInfo {
  id: string;
  name: string;
  topic_area: string;
}

/**
 * Given a comma-separated string of KC IDs (e.g. "VA,LO") and the full KC list,
 * return a human-readable display string (e.g. "Variables, Loops").
 */
export function getKcDisplayName(kcIds: string, kcList: KcInfo[]): string {
  if (!kcIds || !kcList.length) return '';
  return kcIds
    .split(',')
    .map(id => {
      const trimmed = id.trim().toUpperCase();
      const kc = kcList.find(k => k.id.toUpperCase() === trimmed);
      return kc ? kc.name : trimmed;
    })
    .join(', ');
}

/**
 * Default starter code template when no problem-specific starter_code is available.
 */
export const DEFAULT_STARTER_CODE = `program HomeworkTask
dictionary
    // Define your variables here
algorithm
    // Write your logic here
endprogram`;
