import * as React from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

/** Lightweight styled wrapper around the native <select> (no Radix dependency). */
const NativeSelect = React.forwardRef<HTMLSelectElement, React.SelectHTMLAttributes<HTMLSelectElement>>(
  ({ className, children, ...props }, ref) => (
    <div className="relative inline-flex">
      <select
        ref={ref}
        className={cn(
          "h-8 appearance-none rounded-md border border-input bg-secondary/60 pl-3 pr-8 text-sm text-foreground",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
          className,
        )}
        {...props}
      >
        {children}
      </select>
      <ChevronDown className="pointer-events-none absolute right-2 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
    </div>
  ),
);
NativeSelect.displayName = "NativeSelect";

export { NativeSelect };
