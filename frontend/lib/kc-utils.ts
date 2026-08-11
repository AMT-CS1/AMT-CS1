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
 * Sanitizes a title string into a valid DAP program identifier.
 */
export function sanitizeProgramName(name?: string): string {
  if (!name) return 'HomeworkTask';
  const cleaned = name.replace(/[^a-zA-Z0-9_]/g, '');
  return cleaned || 'HomeworkTask';
}

/**
 * Generates boilerplate DAP template code for a problem.
 * Matches standard DAP structure:
 * program [The name of the problem]
 * dictionary
 * 
 * algorithm
 * 
 * endprogram
 */
export function getStarterCodeForProblem(problem?: { title?: string; name?: string; key?: string; starter_code?: string } | null): string {
  const progName = sanitizeProgramName(problem?.title || problem?.name || problem?.key);

  if (problem?.starter_code && problem.starter_code.trim()) {
    const trimmed = problem.starter_code.trim();
    if (trimmed.toLowerCase().startsWith('program')) {
      return trimmed;
    }
    const indented = trimmed.split('\n').map(line => (line.trim() ? `    ${line}` : line)).join('\n');
    return `program ${progName}\ndictionary\n\nalgorithm\n${indented}\nendprogram`;
  }

  return `program ${progName}\ndictionary\n\nalgorithm\n\nendprogram`;
}

/**
 * Default starter code template when no problem-specific info is available.
 */
export const DEFAULT_STARTER_CODE = `program HomeworkTask
dictionary
  {{ Write your variables here }}
algorithm
  {{ Write your algorithms here }}
endprogram`;

