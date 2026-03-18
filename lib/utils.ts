import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatDate(date: Date | string): string {
  const d = typeof date === "string" ? new Date(date) : date;
  return d.toLocaleDateString("en-NZ", { day: "numeric", month: "short", year: "numeric" });
}

export function formatDateTime(date: Date | string): string {
  const d = typeof date === "string" ? new Date(date) : date;
  return d.toLocaleDateString("en-NZ", {
    day: "numeric", month: "short", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}

export function workingDaysRemaining(deadline: Date | string): number {
  const d = typeof deadline === "string" ? new Date(deadline) : deadline;
  const now = new Date();
  let count = 0;
  const current = new Date(now);
  while (current < d) {
    current.setDate(current.getDate() + 1);
    const day = current.getDay();
    if (day !== 0 && day !== 6) count++;
  }
  return count;
}

export function deadlineColor(daysRemaining: number): string {
  if (daysRemaining < 0) return "text-deadline-urgent bg-red-50";
  if (daysRemaining <= 5) return "text-deadline-urgent";
  if (daysRemaining <= 10) return "text-deadline-warning";
  return "text-deadline-safe";
}

export function confidenceColor(score: number): string {
  if (score >= 85) return "confidence-high";
  if (score >= 50) return "confidence-medium";
  return "confidence-low";
}

export function confidenceLabel(score: number): string {
  if (score >= 85) return "High";
  if (score >= 50) return "Medium";
  return "Low";
}
