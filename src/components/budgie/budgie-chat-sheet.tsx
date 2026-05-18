"use client";

import { useState } from "react";
import { MessageCircle, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { BudgieConversation } from "./budgie-conversation";

export interface BudgieChatSheetProps {
  /** Optional className for the launcher button. */
  className?: string;
}

export function BudgieChatSheet({ className }: BudgieChatSheetProps) {
  const [open, setOpen] = useState(false);

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button
          size="sm"
          variant="outline"
          className={className}
          aria-label="Open Budgie chat"
        >
          <Sparkles className="mr-1.5 size-3.5" />
          Ask Budgie
        </Button>
      </SheetTrigger>
      <SheetContent
        side="right"
        className="flex w-full max-w-[28rem] flex-col gap-0 p-4 sm:max-w-[32rem]"
      >
        <SheetHeader className="space-y-1 px-0 pb-2">
          <SheetTitle className="flex items-center gap-2">
            <MessageCircle className="size-4 text-primary" />
            Budgie
          </SheetTitle>
          <SheetDescription>
            Personal-finance assistant that can read your full ledger and propose
            edits. Every write asks for your approval first.
          </SheetDescription>
        </SheetHeader>
        <div className="-mx-4 flex-1 overflow-hidden px-4">
          {open ? <BudgieConversation /> : null}
        </div>
      </SheetContent>
    </Sheet>
  );
}
