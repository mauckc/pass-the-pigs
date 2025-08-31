import React from "react";
import { cn } from "@/lib/utils";

export interface SwitchProps extends React.InputHTMLAttributes<HTMLInputElement> {
  onCheckedChange?: (checked: boolean) => void;
}

const Switch = React.forwardRef<HTMLInputElement, SwitchProps>(
  ({ className, ...props }, ref) => {
    return (
      <div 
        className="relative inline-flex h-6 w-11 items-center rounded-full border-2 border-transparent transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 focus-visible:ring-offset-white disabled:cursor-not-allowed disabled:opacity-50 data-[state=checked]:bg-blue-600 data-[state=unchecked]:bg-gray-200 cursor-pointer"
        data-state={props.checked ? "checked" : "unchecked"}
        onClick={() => {
          const newChecked = !props.checked;
          if (props.onCheckedChange) {
            props.onCheckedChange(newChecked);
          }
          if (props.onChange) {
            props.onChange({ target: { checked: newChecked } } as any);
          }
        }}
      >
        <input
          type="checkbox"
          className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
          ref={ref}
          {...props}
        />
        <span
          className={cn(
            "pointer-events-none block h-5 w-5 rounded-full bg-white shadow-lg ring-0 transition-transform data-[state=checked]:translate-x-5 data-[state=unchecked]:translate-x-0",
            className
          )}
          data-state={props.checked ? "checked" : "unchecked"}
        />
      </div>
    );
  }
);

Switch.displayName = "Switch";

export { Switch };
