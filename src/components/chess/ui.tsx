import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode } from "react";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function Button({
  variant = "primary",
  className,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "quiet" | "ghost" | "danger" }) {
  const look = {
    primary: "bg-brass text-ink hover:bg-brass-2",
    quiet: "border border-line bg-panel text-ivory hover:border-brass",
    ghost: "text-ivory hover:bg-panel",
    danger: "bg-danger text-ivory",
  }[variant];
  return (
    <button
      className={cn(
        "inline-flex h-11 items-center justify-center gap-2 rounded-lg px-4 text-sm font-medium transition disabled:cursor-not-allowed disabled:opacity-40",
        look,
        className,
      )}
      {...props}
    />
  );
}

export function Panel({ children, className }: { children: ReactNode; className?: string }) {
  return <section className={cn("rounded-xl border border-line bg-ink-2 p-4", className)}>{children}</section>;
}

export function Field({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <label className="flex flex-col gap-1 text-sm text-mist">
      {label}
      {children}
    </label>
  );
}

export function TextInput(props: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      className={cn(
        "h-11 rounded-lg border border-line bg-ink px-3 text-ivory outline-none placeholder:text-mist",
        props.className,
      )}
    />
  );
}

export function Meter({ value, label }: { value: number; label?: string }) {
  const pct = Math.max(0, Math.min(100, Math.round(value)));
  return (
    <div>
      {label && (
        <div className="mb-1 flex justify-between text-xs text-mist">
          <span>{label}</span>
          <span className="tabular-nums">{pct}%</span>
        </div>
      )}
      <div className="h-2 overflow-hidden rounded-full bg-panel" role="meter" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
        <div className="h-full bg-brass" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

export function Pill({ children, tone = "mist" }: { children: ReactNode; tone?: "mist" | "brass" | "ok" | "danger" }) {
  const look = {
    mist: "bg-panel text-mist",
    brass: "bg-brass text-ink",
    ok: "bg-ok text-ink",
    danger: "bg-danger text-ivory",
  }[tone];
  return <span className={cn("inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium", look)}>{children}</span>;
}
