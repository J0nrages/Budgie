"use client";

import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { Basis } from "@/types/finance";

type Props = {
  basis: Basis;
  onBasisChange: (b: Basis) => void;
};

export function BasisToggle({ basis, onBasisChange }: Props) {
  return (
    <Tabs
      value={basis}
      onValueChange={(v) => onBasisChange(v as Basis)}
      className="w-full"
    >
      <TabsList className="grid h-9 w-full grid-cols-2 bg-transparent p-0">
        <TabsTrigger
          value="cash"
          className="rounded-xl data-active:bg-white dark:data-active:bg-zinc-800 data-active:shadow-sm"
        >
          Cash basis
        </TabsTrigger>
        <TabsTrigger
          value="accrual"
          className="rounded-xl data-active:bg-white dark:data-active:bg-zinc-800 data-active:shadow-sm"
        >
          Accrual basis
        </TabsTrigger>
      </TabsList>
    </Tabs>
  );
}
