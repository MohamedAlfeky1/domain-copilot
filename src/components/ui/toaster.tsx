"use client";

import {
  Toast,
  ToastClose,
  ToastDescription,
  ToastProvider,
  ToastTitle,
  ToastViewport,
} from "@/components/ui/toast";
import { useToast } from "@/components/ui/use-toast";
import { FiCheckCircle } from "react-icons/fi";

export function Toaster() {
  const { toasts } = useToast();

  return (
    <ToastProvider duration={5000}>
      {toasts.map(function ({ id, title, description, action, icon, variant, ...props }) {
        const isDestructive = variant === "destructive";
        const renderedIcon = icon ?? (!isDestructive ? <FiCheckCircle className="h-[18px] w-[18px] text-[#FAFAFA] shrink-0" /> : null);

        return (
          <Toast key={id} variant={variant} {...props}>
            <div className="flex items-center gap-3 w-full">
              {renderedIcon && (
                <div className="shrink-0 flex items-center justify-center text-[#FAFAFA] [&_svg]:h-[18px] [&_svg]:w-[18px] [&_svg]:text-[#FAFAFA]">
                  {renderedIcon}
                </div>
              )}
              <div className="flex flex-col gap-0.5 min-w-0">
                {title && <ToastTitle>{title}</ToastTitle>}
                {description && (
                  <ToastDescription>{description}</ToastDescription>
                )}
              </div>
            </div>
            {action}
            <ToastClose />
          </Toast>
        );
      })}
      <ToastViewport />
    </ToastProvider>
  );
}
