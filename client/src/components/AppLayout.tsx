import { Link, useLocation } from "wouter";
import { useTheme } from "@/components/ThemeProvider";
import {
  LayoutDashboard, Users, Bell, Sun, Moon, Menu, X
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useState } from "react";
import { Button } from "@/components/ui/button";
const navItems = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard },
  { href: "/contacts", label: "Contacts", icon: Users },
  { href: "/reminders", label: "Reminders", icon: Bell },
];

function Logo() {
  return (
    <svg aria-label="Orbit CRM" viewBox="0 0 32 32" width="28" height="28" fill="none">
      <circle cx="16" cy="16" r="13" stroke="currentColor" strokeWidth="2" opacity="0.3" />
      <circle cx="16" cy="16" r="7" stroke="currentColor" strokeWidth="2.5" />
      <circle cx="16" cy="5" r="3" fill="currentColor" />
    </svg>
  );
}

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const [location] = useLocation();
  const { theme, toggle } = useTheme();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const sidebarContent = (
    <div className="flex flex-col h-full">
      {/* Brand */}
      <div className="flex items-center gap-2.5 px-5 py-5 border-b border-[hsl(var(--sidebar-border))]">
        <div className="text-[hsl(var(--sidebar-primary))]">
          <Logo />
        </div>
        <div>
          <span className="text-[hsl(var(--sidebar-primary-foreground))] font-semibold tracking-tight text-sm leading-none">Orbit</span>
          <p className="text-[hsl(var(--sidebar-foreground))] text-xs opacity-60 leading-none mt-0.5">Personal CRM</p>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-3 py-4 space-y-1" aria-label="Main navigation">
        {navItems.map(({ href, label, icon: Icon }) => {
          const active = href === "/" ? location === "/" : location.startsWith(href);
          return (
            <Link key={href} href={href} onClick={() => setSidebarOpen(false)}
              data-testid={`nav-${label.toLowerCase()}`}
              className={cn(
                "flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors",
                active
                  ? "bg-[hsl(var(--sidebar-accent))] text-[hsl(var(--sidebar-accent-foreground))]"
                  : "text-[hsl(var(--sidebar-foreground))] hover:bg-[hsl(var(--sidebar-accent))] hover:text-[hsl(var(--sidebar-accent-foreground))]"
              )}
            >
              <Icon size={16} className="shrink-0" />
              <span className="flex-1">{label}</span>

            </Link>
          );
        })}
      </nav>

      {/* Bottom actions */}
      <div className="px-3 py-4 border-t border-[hsl(var(--sidebar-border))]">
        <Button
          variant="ghost"
          size="sm"
          onClick={toggle}
          data-testid="button-theme-toggle"
          className="w-full justify-start gap-3 text-[hsl(var(--sidebar-foreground))] hover:text-[hsl(var(--sidebar-accent-foreground))] hover:bg-[hsl(var(--sidebar-accent))]"
        >
          {theme === "dark" ? <Sun size={16} /> : <Moon size={16} />}
          <span>{theme === "dark" ? "Light mode" : "Dark mode"}</span>
        </Button>
      </div>
    </div>
  );

  return (
    <div className="flex h-screen overflow-hidden">
      {/* Desktop sidebar */}
      <aside className="hidden md:flex flex-col w-56 shrink-0 bg-[hsl(var(--sidebar-background))]">
        {sidebarContent}
      </aside>

      {/* Mobile sidebar overlay */}
      {sidebarOpen && (
        <div className="md:hidden fixed inset-0 z-40 flex">
          <div className="absolute inset-0 bg-black/50" onClick={() => setSidebarOpen(false)} />
          <aside className="relative z-10 flex flex-col w-56 bg-[hsl(var(--sidebar-background))]">
            {sidebarContent}
          </aside>
        </div>
      )}

      {/* Main content */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Mobile top bar */}
        <div className="md:hidden flex items-center gap-3 px-4 py-3 border-b border-border bg-background">
          <Button variant="ghost" size="icon" onClick={() => setSidebarOpen(true)} data-testid="button-open-menu">
            <Menu size={20} />
          </Button>
          <div className="flex items-center gap-2 text-primary">
            <Logo />
            <span className="font-semibold text-foreground">Orbit</span>
          </div>
        </div>

        <main className="flex-1 overflow-y-auto">
          {children}
        </main>
      </div>
    </div>
  );
}
