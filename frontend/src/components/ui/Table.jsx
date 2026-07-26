export function Table({ children }) {
  return (
    <div className="overflow-x-auto rounded-lg border border-slate-200">
      <table className="w-full text-sm">{children}</table>
    </div>
  );
}

export function Thead({ children }) {
  return <thead className="bg-slate-50 text-slate-500 text-xs uppercase tracking-wide">{children}</thead>;
}

export function Th({ children, className = "" }) {
  return <th className={`text-left font-semibold px-4 py-2.5 ${className}`}>{children}</th>;
}

export function Td({ children, className = "" }) {
  return <td className={`px-4 py-2.5 text-slate-700 border-t border-slate-100 ${className}`}>{children}</td>;
}

export function EmptyRow({ colSpan, children = "Nothing here yet." }) {
  return (
    <tr>
      <td colSpan={colSpan} className="px-4 py-8 text-center text-slate-400 text-sm">
        {children}
      </td>
    </tr>
  );
}
