import ProblemsManager from '../ProblemsManager';

export default function ProblemsPage() {
  return (
    <div className="space-y-8">
      {/* Page Title */}
      <div>
        <h1 className="text-2xl font-extrabold text-slate-900">Problem Management</h1>
        <p className="text-xs text-slate-500 mt-1">
          Create, edit, and manage coding problems with KC tags and test cases.
        </p>
      </div>

      {/* Problems Management */}
      <ProblemsManager />
    </div>
  );
}
