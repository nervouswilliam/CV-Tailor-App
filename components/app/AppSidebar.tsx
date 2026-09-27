"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { FilePlus2, LayoutDashboard, Settings, Moon, Sun, FileText } from "lucide-react";
import { useTheme } from "next-themes";
import { cn } from "@/lib/utils";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

const NAV = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard, match: (p: string) => p === "/" },
  { href: "/applications/new", label: "New Application", icon: FilePlus2, match: (p: string) => p === "/applications/new" },
  { href: "/settings", label: "Settings", icon: Settings, match: (p: string) => p.startsWith("/settings") },
];

export function AppSidebar() {
  const pathname = usePathname();
  const { resolvedTheme, setTheme } = useTheme();
  return (
    <aside className="flex w-14 shrink-0 flex-col items-center gap-1 border-r bg-background py-3 lg:w-52 lg:items-stretch lg:px-3">
      <Link href="/" className="mb-4 flex items-center gap-2 px-1.5 lg:px-2">
        <span className="grid size-7 place-items-center rounded-lg bg-primary text-primary-foreground">
          <FileText className="size-4" />
        </span>
        <span className="hidden text-sm font-semibold tracking-tight lg:inline">CV Tailor</span>
      </Link>
      {NAV.map(({ href, label, icon: Icon, match }) => {
        const active = match(pathname);
        return (
          <Tooltip key={href}>
            <TooltipTrigger
              render={
                <Link
                  href={href}
                  className={cn(
                    "flex items-center gap-2.5 rounded-lg px-2 py-2 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground",
                    active && "bg-primary/10 font-medium text-primary hover:bg-primary/15 hover:text-primary",
                  )}
                />
              }
            >
              <Icon className="size-4 shrink-0" />
              <span className="hidden lg:inline">{label}</span>
            </TooltipTrigger>
            <TooltipContent side="right" className="lg:hidden">
              {label}
            </TooltipContent>
          </Tooltip>
        );
      })}
      <div className="flex-1" />
      <button
        onClick={() => setTheme(resolvedTheme === "dark" ? "light" : "dark")}
        className="flex items-center gap-2.5 rounded-lg px-2 py-2 text-sm text-muted-foreground hover:bg-muted hover:text-foreground"
        aria-label="Toggle theme"
      >
        <Sun className="size-4 dark:hidden" />
        <Moon className="hidden size-4 dark:block" />
        <span className="hidden lg:inline">Theme</span>
      </button>
    </aside>
  );
}
