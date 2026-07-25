import { 
  HomeworkStatus, 
  MPSessionStatus, 
  MPSubmitRequest, 
  MPSubmitResult, 
  ClassReport, 
  HeatmapData, 
  StudentDrilldown, 
  XlsxUploadResponse 
} from './homework-types';

/**
 * Fetch list of homework status badges for student.
 */
export async function getHomeworkStatuses(): Promise<HomeworkStatus[]> {
  const res = await fetch('/api/homework/status');
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || 'Failed to load homework statuses');
  }
  return res.json();
}

/**
 * Get or create an active MP session for a weekly target.
 */
export async function getMPSession(weeklyTargetId: string): Promise<MPSessionStatus> {
  const res = await fetch(`/api/homework/${weeklyTargetId}/mp-session`);
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || 'Failed to load misconception session');
  }
  return res.json();
}

/**
 * Submit an answer (A/B/C/D) to the active MP question.
 */
export async function submitMPAnswer(payload: MPSubmitRequest): Promise<MPSubmitResult> {
  const res = await fetch(`/api/homework/${payload.weekly_target_id}/mp-submit`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || 'Failed to submit MP answer');
  }
  return res.json();
}

/**
 * Fetch overall class report for instructor dashboard.
 */
export async function getClassReport(weeklyTargetId: string): Promise<ClassReport> {
  const res = await fetch(`/api/homework/${weeklyTargetId}/class-report`);
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || 'Failed to fetch class summary report');
  }
  return res.json();
}

/**
 * Fetch misconception heatmap data for instructor dashboard.
 */
export async function getHeatmapReport(weeklyTargetId: string): Promise<HeatmapData> {
  const res = await fetch(`/api/homework/${weeklyTargetId}/heatmap`);
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || 'Failed to fetch misconception heatmap');
  }
  return res.json();
}

/**
 * Fetch detailed attempt history for a specific student.
 */
export async function getStudentDrilldown(weeklyTargetId: string, userId: string): Promise<StudentDrilldown> {
  const res = await fetch(`/api/homework/${weeklyTargetId}/drill-down/${userId}`);
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || 'Failed to fetch student drill-down');
  }
  return res.json();
}

/**
 * Upload XLSX spreadsheet workbook.
 */
export async function uploadXlsxFile(file: File): Promise<XlsxUploadResponse> {
  const formData = new FormData();
  formData.append('file', file);

  const res = await fetch('/api/homework/upload-xlsx', {
    method: 'POST',
    body: formData
  });

  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || 'Failed to process XLSX upload');
  }
  return res.json();
}
