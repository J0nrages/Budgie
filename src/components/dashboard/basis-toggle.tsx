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
      className="w-full max-w-xs"
    >
      <TabsList className="grid w-full grid-cols-2">
        <TabsTrigger value="cash">Cash basis</TabsTrigger>
        <TabsTrigger value="accrual">Accrual basis</TabsTrigger>
      </TabsList>
    </Tabs>
  );
}
