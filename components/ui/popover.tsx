
"use client";

import * as React from "react";
import * as PopoverPrimitive from "@radix-ui/react-popover";

// Giữ API giống shadcn: Popover, PopoverTrigger, PopoverContent
const Popover = PopoverPrimitive.Root;
const PopoverTrigger = PopoverPrimitive.Trigger;

const PopoverContent = React.forwardRef<
  React.ElementRef<typeof PopoverPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof PopoverPrimitive.Content>
>(({ className, align = "center", sideOffset = 8, ...props }, ref) => {
  // gộp className an toàn mà không cần thư viện ngoài
  const cx = [
    "z-50 rounded-md border bg-white text-slate-900 shadow-md outline-none",
    // hiệu ứng mở/đóng (tailwind variants – tuỳ config của bạn)
    "data-[state=open]:animate-in data-[state=closed]:animate-out",
    "data-[side=bottom]:slide-in-from-top-2 data-[side=top]:slide-in-from-bottom-2",
    className,
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <PopoverPrimitive.Content
      ref={ref}
      align={align}
      sideOffset={sideOffset}
      className={cx}
      {...props}
    />
  );
});
PopoverContent.displayName = "PopoverContent";

export { Popover, PopoverTrigger, PopoverContent };
