const VARIANTS = {
  primary: "bg-brand-500 text-white hover:bg-brand-600 focus-visible:ring-brand-400",
  secondary: "bg-white text-brand-500 border border-brand-200 hover:bg-brand-50",
  danger: "bg-red-600 text-white hover:bg-red-700",
  ghost: "bg-transparent text-slate-600 hover:bg-slate-100",
  amber: "bg-amber-500 text-white hover:bg-amber-600",
  teal: "bg-teal-500 text-white hover:bg-teal-600",
};

const SIZES = {
  sm: "px-3 py-1.5 text-sm",
  md: "px-4 py-2 text-sm",
  lg: "px-5 py-2.5 text-base",
};

export default function Button({
  children,
  variant = "primary",
  size = "md",
  className = "",
  disabled = false,
  type = "button",
  ...props
}) {
  return (
    <button
      type={type}
      disabled={disabled}
      className={`inline-flex items-center justify-center gap-2 rounded-lg font-medium transition-colors whitespace-nowrap
        disabled:opacity-50 disabled:cursor-not-allowed
        focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2
        ${VARIANTS[variant]} ${SIZES[size]} ${className}`}
      {...props}
    >
      {children}
    </button>
  );
}
