import type { ButtonHTMLAttributes } from "react";

type Props = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "solid" | "ghost" | "danger";
};

const styles: Record<NonNullable<Props["variant"]>, string> = {
  solid: "bg-white text-black hover:bg-neutral-200",
  ghost: "bg-white/5 text-white border border-white/15 hover:bg-white/10",
  danger: "bg-red-500/90 text-white hover:bg-red-400",
};

export function Button({ variant = "solid", className = "", type = "button", ...props }: Props) {
  return (
    <button
      type={type}
      className={`inline-flex items-center justify-center rounded-pill px-3 py-2 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-50 ${styles[variant]} ${className}`}
      {...props}
    />
  );
}
