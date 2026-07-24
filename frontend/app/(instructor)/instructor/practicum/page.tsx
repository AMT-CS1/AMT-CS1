import HomeworkManager from '../HomeworkManager';

export default function PracticumPage() {
  return (
    <div className="space-y-8">
      {/* Page Title */}
      <div>
        <h1 className="text-2xl font-extrabold text-slate-900">Checkpoint Management</h1>
        <p className="text-xs text-slate-500 mt-1">
          Schedule in-class checkpoints with start times, access passwords, and automatic grading at the deadline.
        </p>
      </div>

      {/* Checkpoint Management */}
      <HomeworkManager kind="lab" />
    </div>
  );
}
