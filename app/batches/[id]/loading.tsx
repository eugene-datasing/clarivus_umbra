import { Loader } from "lucide-react";

export default function Loading() {
  return (
    <div className="p-6 flex items-center gap-3">
      <Loader className="w-5 h-5 text-brand-primary animate-spin" />
      <span className="text-sm text-txt-secondary">Loading case...</span>
    </div>
  );
}
