import HomeworkManager from '../HomeworkManager';

export default function PracticumPage() {
  return (
    <div className="space-y-8">
      {/* Page Title */}
      <div>
        <h1 className="text-2xl font-extrabold text-slate-900">Practicum Management</h1>
        <p className="text-xs text-slate-500 mt-1">
          Schedule in-class practicum sessions with start times, session passwords, and automatic grading at the deadline.
        </p>
      </div>

      {/* Practicum Management */}
      <HomeworkManager kind="lab" />
    </div>
  );
}
