"use client";

import { User } from "lucide-react";

interface ProfileClientProps {
  user: {
    id: string;
    name: string;
    email: string;
    role: string;
  };
}

function formatRole(role: string): string {
  return role
    .split("-")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

export default function ProfileClient({ user }: ProfileClientProps) {
  return (
    <div className="max-w-2xl mx-auto py-8 px-4">
      <div className="flex items-center gap-3 mb-6">
        <div className="w-10 h-10 rounded-full bg-brand-primary flex items-center justify-center">
          <User className="w-5 h-5 text-white" />
        </div>
        <div>
          <h1 className="text-xl font-heading font-bold text-txt-primary">Profile</h1>
          <p className="text-sm text-txt-secondary">Account details</p>
        </div>
      </div>

      <div className="card">
        <div className="grid grid-cols-2 gap-6">
          <div>
            <label className="block text-sm font-medium text-txt-secondary mb-1">Name</label>
            <p className="text-sm font-medium text-txt-primary">{user.name}</p>
          </div>
          <div>
            <label className="block text-sm font-medium text-txt-secondary mb-1">Email</label>
            <p className="text-sm font-medium text-txt-primary font-mono">{user.email}</p>
          </div>
          <div>
            <label className="block text-sm font-medium text-txt-secondary mb-1">Role</label>
            <p className="text-sm font-medium text-txt-primary">{formatRole(user.role)}</p>
          </div>
        </div>
      </div>
    </div>
  );
}
