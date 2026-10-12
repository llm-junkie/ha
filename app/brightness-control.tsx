import { useState, type ComponentProps } from "react";
import { Sun } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover";
import { Slider } from "@/components/ui/slider";
import { snapBackgroundBrightness } from "./background-brightness";

export default function BrightnessControl({
  value,
  onChange,
  horizontal,
  anchor,
}: {
  value: number;
  onChange: (value: number) => void;
  horizontal: boolean;
  anchor: ComponentProps<typeof PopoverContent>["anchor"];
}) {
  const [open, setOpen] = useState(false);
  const orientation = horizontal ? "horizontal" : "vertical";
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        render={
          <Button
            variant="ghost"
            aria-label="Background brightness"
            title="Background brightness"
            className={open ? "active" : ""}
          />
        }
      >
        <Sun size={18} />
      </PopoverTrigger>
      <PopoverContent
        className="brightness-popover"
        data-orientation={orientation}
        anchor={anchor}
        positionMethod="fixed"
        side={horizontal ? "bottom" : "left"}
        align="center"
        sideOffset={10}
        collisionAvoidance={{ side: "shift", align: "shift", fallbackAxisSide: "none" }}
        collisionPadding={16}
      >
        <Slider
          aria-label="Background brightness"
          orientation={orientation}
          min={-100}
          max={100}
          step={1}
          value={[value]}
          onValueChange={(next, details) =>
            onChange(
              snapBackgroundBrightness(
                Array.isArray(next) ? next[0] : next,
                details.reason !== "keyboard",
              ),
            )
          }
        />
      </PopoverContent>
    </Popover>
  );
}
