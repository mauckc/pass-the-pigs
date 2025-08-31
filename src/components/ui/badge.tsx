import React from "react";
import { cn } from "@/lib/utils";

export interface BadgeProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: "default" | "secondary" | "destructive" | "outline";
}

const Badge = React.forwardRef<HTMLDivElement, BadgeProps>(
  ({ className, variant = "default", ...props }, ref) => {
    const baseClasses = "inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2";
    
    const variants = {
      default: "border-transparent bg-blue-600 text-white hover:bg-blue-700",
      secondary: "border-transparent bg-gray-100 text-gray-900 hover:bg-gray-200",
      destructive: "border-transparent bg-red-600 text-white hover:bg-red-700",
      outline: "text-gray-900 border-gray-300 bg-white",
    };
    
    const classes = cn(
      baseClasses,
      variants[variant],
      className
    );
    
    return (
      <div
        ref={ref}
        className={classes}
        {...props}
      />
    );
  }
);

Badge.displayName = "Badge";

export { Badge };
