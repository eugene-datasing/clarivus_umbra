import Link from "next/link";

export default function NotFound() {
  return (
    <div className="p-6 flex flex-col items-center justify-center min-h-[60vh]">
      <h1 className="text-4xl font-heading font-bold text-txt-primary mb-2">404</h1>
      <p className="text-sm text-txt-secondary mb-6">Page not found</p>
      <Link href="/" className="btn-primary">
        Back to Dashboard
      </Link>
    </div>
  );
}
