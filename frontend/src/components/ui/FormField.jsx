export function Field({ label, children, className = "" }) {
  return (
    <label className={`flex flex-col gap-1.5 text-sm ${className}`}>
      <span className="font-medium text-slate-700">{label}</span>
      {children}
    </label>
  );
}

const fieldClasses =
  "form-field w-full rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-sm text-slate-800 " +
  "placeholder:text-slate-400 outline-none transition " +
  "focus:border-brand-400 focus:bg-white focus:ring-4 focus:ring-brand-100";

export function Input(props) {
  return <input {...props} className={`${fieldClasses} ${props.className || ""}`} />;
}

export function Select({ children, ...props }) {
  return (
    <select {...props} className={`${fieldClasses} ${props.className || ""}`}>
      {children}
    </select>
  );
}

export function Textarea(props) {
  return <textarea {...props} className={`${fieldClasses} ${props.className || ""}`} />;
}
