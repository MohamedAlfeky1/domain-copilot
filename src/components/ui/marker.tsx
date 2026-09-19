import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const markerVariants = cva(
  "inline-flex items-center gap-2 text-xs font-normal transition-colors select-none",
  {
    variants: {
      variant: {
        default: "text-muted-foreground",
        border: "w-full border-b border-border pb-2.5 text-foreground",
        bordered: "w-full border-b border-border pb-2.5 text-foreground",
        outline: "border border-border rounded-md px-2.5 py-1 text-foreground",
        destructive: "text-destructive",
        warning: "text-amber-600 dark:text-amber-500",
        success: "text-emerald-600 dark:text-emerald-500",
      },
      size: {
        default: "text-xs",
        sm: "text-[11px]",
        lg: "text-sm",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
);

export interface MarkerProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof markerVariants> {}

const Marker = React.forwardRef<HTMLDivElement, MarkerProps>(
  ({ className, variant, size, ...props }, ref) => {
    return (
      <div
        ref={ref}
        className={cn(markerVariants({ variant, size }), className)}
        {...props}
      />
    );
  }
);
Marker.displayName = "Marker";

const MarkerIcon = React.forwardRef<
  HTMLSpanElement,
  React.HTMLAttributes<HTMLSpanElement>
>(({ className, ...props }, ref) => {
  return (
    <span
      ref={ref}
      className={cn(
        "inline-flex items-center justify-center shrink-0 text-muted-foreground transition-colors",
        className
      )}
      {...props}
    />
  );
});
MarkerIcon.displayName = "MarkerIcon";

const MarkerContent = React.forwardRef<
  HTMLSpanElement,
  React.HTMLAttributes<HTMLSpanElement>
>(({ className, ...props }, ref) => {
  return (
    <span
      ref={ref}
      className={cn(
        "inline-flex items-center font-normal tracking-tight text-foreground transition-colors truncate",
        className
      )}
      {...props}
    />
  );
});
MarkerContent.displayName = "MarkerContent";

export { Marker, MarkerIcon, MarkerContent, markerVariants };
