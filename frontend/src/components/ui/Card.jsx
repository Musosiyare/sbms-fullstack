export default function Card({ title, subtitle, actions, children, className = "" }) {
  return (
    <section className={`bg-white border border-slate-200 rounded-xl shadow-sm p-4 sm:p-6 mb-6 ${className}`}>
      {(title || actions) && (
        <div className="flex flex-wrap items-start justify-between mb-4 gap-3">
          <div className="min-w-0">
            {title && <h3 className="text-base font-semibold text-slate-800">{title}</h3>}
            {subtitle && <p className="text-sm text-slate-500 mt-0.5">{subtitle}</p>}
          </div>
          {actions && <div className="flex flex-wrap gap-2 w-full lg:w-auto lg:shrink-0">{actions}</div>}
        </div>
      )}
      {children}
    </section>
  );
}
