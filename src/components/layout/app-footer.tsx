import { DemoDataControls } from "@/components/demo-data-controls";
import { ThemeToggle } from "@/components/theme-toggle";

export function AppFooter() {
  return (
    <footer
      className="mt-auto border-t border-border pt-8"
      role="contentinfo"
      aria-label="Workspace utilities"
    >
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0 flex-1">
          <DemoDataControls />
        </div>
        <div className="flex shrink-0 justify-end">
          <ThemeToggle />
        </div>
      </div>
    </footer>
  );
}
