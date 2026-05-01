import { Loader } from "lucide-react";

export default function Loading() {
  return (
    <div className="flex items-center justify-center h-screen bg-surface-bg">
      <div className="flex flex-col items-center gap-3">
        <Loader className="w-8 h-8 text-brand-primary animate-spin" />
        <span className="text-sm text-txt-secondary">Loading document review...</span>
      </div>
    </div>
  );
}
