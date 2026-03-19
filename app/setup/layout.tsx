export default function SetupLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="bg-surface-bg min-h-screen">
      {children}
    </div>
  );
}
