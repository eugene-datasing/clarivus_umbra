"use client";

import { useState, useRef, useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSession, signOut } from "next-auth/react";
import { cn } from "@/lib/utils";
import {
  LayoutDashboard, FolderOpen, ClipboardList, PlusCircle,
  Settings2, Brain, FileBarChart, Cog, Bell, ChevronLeft, ChevronRight, Shield,
  Clock, FileText, CheckCircle, AlertTriangle, X, LogOut,
} from "lucide-react";

const navItems = [
  { label: "Dashboard", href: "/", icon: LayoutDashboard, section: "main" },
  { label: "Cases", href: "/requests", icon: FolderOpen, section: "main" },
  { label: "My Queue", href: "/queue", icon: ClipboardList, section: "main" },
  { label: "New Case", href: "/requests/new", icon: PlusCircle, section: "main" },
  { label: "Custom Rules", href: "/admin/rules", icon: Settings2, section: "admin" },
  { label: "AI Governance", href: "/admin/ai-governance", icon: Brain, section: "admin" },
  { label: "Reports", href: "/reports", icon: FileBarChart, section: "admin" },
  { label: "Settings", href: "/admin/settings", icon: Cog, section: "system" },
];

const notifications = [
  { id: 1, icon: AlertTriangle, color: "text-amber-600 bg-amber-50", text: "LGOIMA-2026-042 deadline in 3 days", time: "10 min ago" },
  { id: 2, icon: CheckCircle, color: "text-green-600 bg-green-50", text: "K. Williams completed review of doc-009", time: "25 min ago" },
  { id: 3, icon: FileText, color: "text-blue-600 bg-blue-50", text: "12 new detections in Coastal Walkway case", time: "1 hr ago" },
  { id: 4, icon: Clock, color: "text-purple-600 bg-purple-50", text: "Senior review requested for LGOIMA-2026-039", time: "2 hr ago" },
  { id: 5, icon: CheckCircle, color: "text-green-600 bg-green-50", text: "Export package verified for LGOIMA-2026-038", time: "3 hr ago" },
];

const roleLabels: Record<string, string> = {
  reviewer: "Reviewer",
  "senior-reviewer": "Senior Reviewer",
  admin: "Admin",
};

function getInitials(name: string): string {
  return name
    .split(" ")
    .map((w) => w[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
}

export function Sidebar() {
  const pathname = usePathname();
  const { data: session } = useSession();
  const [collapsed, setCollapsed] = useState(false);
  const [showNotifications, setShowNotifications] = useState(false);
  const notifRef = useRef<HTMLDivElement>(null);

  const userName = session?.user?.name ?? "User";
  const userRole = (session?.user as { role?: string })?.role ?? "reviewer";
  const initials = getInitials(userName);

  // Close notifications when clicking outside
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (notifRef.current && !notifRef.current.contains(e.target as Node)) {
        setShowNotifications(false);
      }
    }
    if (showNotifications) document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [showNotifications]);

  const isActive = (href: string) => {
    if (href === "/") return pathname === "/";
    return pathname.startsWith(href);
  };

  const sections = {
    main: navItems.filter((i) => i.section === "main"),
    admin: navItems.filter((i) => i.section === "admin"),
    system: navItems.filter((i) => i.section === "system"),
  };

  const sectionLabels: Record<string, string> = {
    main: "",
    admin: "Administration",
    system: "System",
  };

  return (
    <aside
      className={cn(
        "fixed left-0 top-0 h-screen bg-brand-primary text-white flex flex-col z-40 transition-all duration-200",
        collapsed ? "w-16" : "w-[260px]"
      )}
    >
      {/* Logo */}
      <div className="flex items-center gap-3 px-4 py-5 border-b border-white/10">
        <div className="w-8 h-8 rounded-lg bg-white/20 flex items-center justify-center flex-shrink-0">
          <Shield className="w-5 h-5 text-white" />
        </div>
        {!collapsed && (
          <div>
            <div className="font-heading text-lg font-bold tracking-tight">Veil</div>
            <div className="text-[10px] text-white/50 -mt-0.5 tracking-widest uppercase">Clarivus AI</div>
          </div>
        )}
      </div>

      {/* Navigation */}
      <nav className="flex-1 py-3 overflow-y-auto">
        {Object.entries(sections).map(([key, items], sIdx) => (
          <div key={key}>
            {sIdx > 0 && <div className="mx-4 my-2 border-t border-white/10" />}
            {!collapsed && sectionLabels[key] && (
              <div className="px-5 py-1.5 text-[10px] uppercase tracking-widest text-white/40 font-semibold">
                {sectionLabels[key]}
              </div>
            )}
            {items.map((item) => {
              const Icon = item.icon;
              const active = isActive(item.href);
              return (
                <Link
                  key={item.label}
                  href={item.href}
                  className={cn(
                    "flex items-center gap-3 px-4 py-2.5 mx-2 rounded-lg text-sm font-medium transition-colors",
                    active
                      ? "bg-white/20 text-white"
                      : "text-white/70 hover:bg-white/10 hover:text-white"
                  )}
                  title={collapsed ? item.label : undefined}
                >
                  <Icon className="w-5 h-5 flex-shrink-0" />
                  {!collapsed && <span>{item.label}</span>}
                </Link>
              );
            })}
          </div>
        ))}
      </nav>

      {/* Bottom section — user + notifications */}
      <div className="border-t border-white/10 p-3" ref={notifRef}>
        {/* Notification panel */}
        {showNotifications && !collapsed && (
          <div className="absolute bottom-[100px] left-3 w-[252px] bg-white rounded-card shadow-xl border border-gray-200 overflow-hidden z-50">
            <div className="flex items-center justify-between px-4 py-2.5 border-b border-gray-100">
              <span className="text-xs font-semibold text-txt-primary">Notifications</span>
              <button onClick={() => setShowNotifications(false)} className="text-txt-secondary hover:text-txt-primary">
                <X size={14} />
              </button>
            </div>
            <div className="max-h-[300px] overflow-y-auto">
              {notifications.map((n) => {
                const NIcon = n.icon;
                return (
                  <div key={n.id} className="flex items-start gap-2.5 px-4 py-2.5 hover:bg-gray-50 border-b border-gray-50 last:border-0 cursor-pointer">
                    <div className={cn("w-6 h-6 rounded-full flex items-center justify-center shrink-0 mt-0.5", n.color.split(" ")[1])}>
                      <NIcon size={12} className={n.color.split(" ")[0]} />
                    </div>
                    <div className="min-w-0">
                      <p className="text-xs text-txt-primary leading-snug">{n.text}</p>
                      <p className="text-[10px] text-txt-secondary mt-0.5">{n.time}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        <div className="flex items-center gap-3 px-2 py-2">
          <div className="w-8 h-8 rounded-full bg-white/20 flex items-center justify-center flex-shrink-0 text-xs font-bold">
            {initials}
          </div>
          {!collapsed && (
            <div className="flex-1 min-w-0">
              <div className="text-sm font-medium truncate">{userName}</div>
              <div className="text-xs text-white/50">{roleLabels[userRole] ?? userRole}</div>
            </div>
          )}
          {!collapsed && (
            <div className="flex items-center gap-1">
              <button
                onClick={() => setShowNotifications(!showNotifications)}
                className={cn(
                  "relative p-1.5 rounded transition-colors",
                  showNotifications ? "bg-white/20" : "hover:bg-white/10"
                )}
              >
                <Bell className="w-4 h-4" />
                <span className="absolute -top-0.5 -right-0.5 w-3.5 h-3.5 bg-red-500 rounded-full text-[9px] flex items-center justify-center">3</span>
              </button>
              <button
                onClick={() => signOut({ callbackUrl: "/login" })}
                className="p-1.5 rounded hover:bg-white/10 transition-colors"
                title="Sign out"
              >
                <LogOut className="w-4 h-4" />
              </button>
            </div>
          )}
        </div>
        <button
          onClick={() => setCollapsed(!collapsed)}
          className="w-full flex items-center justify-center mt-1 p-1.5 hover:bg-white/10 rounded text-white/50"
        >
          {collapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
        </button>
      </div>
    </aside>
  );
}
