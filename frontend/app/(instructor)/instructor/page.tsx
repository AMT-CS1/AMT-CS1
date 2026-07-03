import HomeworkManager from './HomeworkManager';

export default function InstructorPage() {
  return (
    <div className="space-y-8">
      {/* Page Title */}
      <div>
        <h1 className="text-2xl font-extrabold text-slate-900">Homework Management</h1>
        <p className="text-xs text-slate-500 mt-1">
          Configure weekly homework assignments and tie them to KC-focused problem sets.
        </p>
      </div>

      {/* Homework Management */}
      <HomeworkManager kind="homework" />
    </div>
  );
}
