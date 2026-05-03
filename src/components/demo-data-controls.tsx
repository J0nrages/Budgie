"use client";

import { useMutation, useQuery } from "convex/react";
import { toast } from "sonner";
import { api } from "convex/_generated/api";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";

export function DemoDataControls() {
  const demoState = useQuery(api.seed.demoState);
  const seedDemo = useMutation(api.seed.run);
  const removeDemo = useMutation(api.seed.removeDemo);

  async function onSeedDemo() {
    try {
      const result = await seedDemo({});
      toast.message(result.message);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Seed failed");
    }
  }

  async function onRemoveDemo() {
    try {
      const result = await removeDemo({});
      toast.message(result.message);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Could not remove demo data",
      );
    }
  }

  async function onResetDemo() {
    try {
      const removed = await removeDemo({});
      if (!removed.removed) {
        toast.message(removed.message);
        return;
      }

      const seeded = await seedDemo({});
      toast.message(seeded.message);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Could not reset demo data",
      );
    }
  }

  const isLoading = demoState === undefined;
  const canSeed = demoState?.canSeed === true;
  const canRemoveDemo = demoState?.canRemoveDemo === true;
  const canResetDemo =
    demoState?.canRemoveDemo === true && demoState.realAccountCount === 0;

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button
        variant="secondary"
        size="sm"
        onClick={onSeedDemo}
        disabled={isLoading || !canSeed}
        title={demoState?.message ?? "Checking demo data status"}
      >
        Load demo data
      </Button>
      <AlertDialog>
        <AlertDialogTrigger asChild>
          <Button
            variant="outline"
            size="sm"
            disabled={isLoading || !canRemoveDemo}
            title={demoState?.message ?? "Checking demo data status"}
          >
            Remove demo data
          </Button>
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove demo data?</AlertDialogTitle>
            <AlertDialogDescription>
              This only removes records marked as demo data. It will refuse to
              run if non-demo transactions, statements, or imports reference
              demo accounts.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={onRemoveDemo}>
              Remove demo data
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <AlertDialog>
        <AlertDialogTrigger asChild>
          <Button
            variant="secondary"
            size="sm"
            disabled={isLoading || !canResetDemo}
            title={
              canResetDemo
                ? "Replace demo records with the latest dated demo dataset"
                : demoState?.message ?? "Checking demo data status"
            }
          >
            Reset demo data
          </Button>
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Reset demo data?</AlertDialogTitle>
            <AlertDialogDescription>
              This removes the current demo-only records, then reloads the
              latest dated demo dataset. It is disabled when real accounts are
              present.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={onResetDemo}>
              Reset demo data
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      {demoState ? (
        <p className="text-xs text-muted-foreground">
          {demoState.demoAccountCount > 0
            ? `${demoState.legacyDemoDetected ? "Old demo set: " : "Demo set: "}${demoState.demoAccountCount} account(s), ${demoState.demoTransactionCount} transaction(s)`
            : demoState.message}
        </p>
      ) : null}
    </div>
  );
}
