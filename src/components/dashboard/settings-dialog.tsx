"use client";

import { Settings } from "lucide-react";
import {
  type CSSProperties,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { BasisToggle } from "@/components/dashboard/basis-toggle";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import type { Basis } from "@/types/finance";

type Props = {
  basis: Basis;
  onBasisChange: (b: Basis) => void;
};

const PANEL_MAX_WIDTH = 352;
const PANEL_MARGIN = 16;
const TRIGGER_INSET = 12;

type DialogAnchor = {
  left: number;
  top: number;
  originX: number;
  originY: number;
};

export function SettingsDialog({ basis, onBasisChange }: Props) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const [anchor, setAnchor] = useState<DialogAnchor>({
    left: PANEL_MARGIN,
    top: 32,
    originX: PANEL_MAX_WIDTH - PANEL_MARGIN,
    originY: PANEL_MARGIN,
  });

  const updateAnchor = useCallback(() => {
    const trigger = triggerRef.current;

    if (!trigger) {
      return;
    }

    const rect = trigger.getBoundingClientRect();
    const panelWidth = Math.min(
      PANEL_MAX_WIDTH,
      Math.max(0, window.innerWidth - PANEL_MARGIN * 2),
    );
    const left = Math.min(
      Math.max(rect.right + TRIGGER_INSET - panelWidth, PANEL_MARGIN),
      window.innerWidth - panelWidth - PANEL_MARGIN,
    );
    const top = Math.max(rect.top - TRIGGER_INSET, PANEL_MARGIN);

    setAnchor({
      left,
      top,
      originX: rect.left + rect.width / 2 - left,
      originY: rect.top + rect.height / 2 - top,
    });
  }, []);

  useEffect(() => {
    if (!open) {
      return;
    }

    window.addEventListener("resize", updateAnchor);
    window.addEventListener("scroll", updateAnchor, true);

    return () => {
      window.removeEventListener("resize", updateAnchor);
      window.removeEventListener("scroll", updateAnchor, true);
    };
  }, [open, updateAnchor]);

  const contentStyle = {
    left: anchor.left,
    top: anchor.top,
    transformOrigin: `${anchor.originX}px ${anchor.originY}px`,
  } satisfies CSSProperties;

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (nextOpen) {
          updateAnchor();
        }

        setOpen(nextOpen);
      }}
    >
      <DialogTrigger asChild>
        <Button
          ref={triggerRef}
          variant="outline"
          size="icon"
          className="relative z-[60] rounded-full bg-background/80 shadow-sm backdrop-blur transition-all duration-300 data-[state=open]:bg-muted data-[state=open]:[&_svg]:rotate-90"
        >
          <Settings className="size-4 transition-transform duration-300" />
          <span className="sr-only">Settings</span>
        </Button>
      </DialogTrigger>
      <DialogContent
        showCloseButton={false}
        style={contentStyle}
        onInteractOutside={(event) => {
          if (
            event.target instanceof Node &&
            triggerRef.current?.contains(event.target)
          ) {
            event.preventDefault();
          }
        }}
        className="w-[min(calc(100vw-2rem),22rem)] max-w-none translate-x-0 translate-y-0 gap-0 overflow-hidden rounded-[2rem] border border-white/30 bg-background/70 p-0 shadow-2xl shadow-black/20 backdrop-blur-2xl duration-500 ease-[cubic-bezier(0.22,1,0.36,1)] data-open:slide-in-from-top-4 data-open:zoom-in-75 data-closed:slide-out-to-top-4 data-closed:zoom-out-75 dark:border-white/10 dark:bg-zinc-950/70"
      >
        <DialogHeader className="px-5 pt-5 pr-14 pb-1">
          <DialogTitle className="text-base font-semibold">
            Settings
          </DialogTitle>
        </DialogHeader>

        <div className="px-5 pt-5 pb-5">
          <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            Accounting Basis
          </p>
          <div className="rounded-2xl bg-muted/50 p-1">
            <BasisToggle basis={basis} onBasisChange={onBasisChange} />
          </div>
        </div>

        <div className="border-t border-border/40 px-5 py-3">
          <p className="text-center text-[10px] text-muted-foreground">
            Budgie v1.0.0
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}
