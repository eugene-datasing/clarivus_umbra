"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import Link from "next/link";
import Image from "next/image";
import {
  EyeOff,
  Shield,
  Scale,
  Layers,
  Users,
  FileCheck,
  Zap,
  Monitor,
  FileSearch,
  Brain,
  Download,
  Upload,
  CheckCircle,
  Send,
  Check,
  Menu,
  X,
  ArrowRight,
  ChevronRight,
  Lock,
  Globe,
  KeyRound,
  UserCog,
  ShieldCheck,
  Server,
} from "lucide-react";

/* ------------------------------------------------------------------ */
/*  Scroll-reveal hook                                                 */
/* ------------------------------------------------------------------ */
function useReveal() {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setVisible(true);
          io.unobserve(el);
        }
      },
      { threshold: 0.12 }
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  return { ref, visible };
}

/* ------------------------------------------------------------------ */
/*  Smooth-scroll helper                                               */
/* ------------------------------------------------------------------ */
function scrollTo(id: string) {
  const el = document.getElementById(id);
  if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
}

/* ------------------------------------------------------------------ */
/*  Data                                                               */
/* ------------------------------------------------------------------ */
const NAV_LINKS = [
  { label: "Features", id: "features" },
  { label: "How It Works", id: "how-it-works" },
  { label: "Security", id: "security" },
  { label: "Contact", id: "contact" },
];

const FEATURES = [
  {
    Icon: Shield,
    title: "AI-Powered Detection",
    text: "Advanced AI models identify personal information, commercially sensitive content, and legally privileged material with deep contextual understanding. Continuously updated with the latest models available\u00a0\u2014 so detection accuracy improves over time, not just with pattern matching.",
  },
  {
    Icon: Scale,
    title: "Full LGOIMA Compliance",
    text: "Link every redaction to statutory grounds across 23 withholding provisions under s6, s7, and s17. Auto-generate withholding schedules with reasoning for both requesters and the Ombudsman. Defensible disclosure, every time.",
  },
  {
    Icon: Layers,
    title: "Bulk Processing at Scale",
    text: "Ingest 1,000\u201310,000+ documents in a single request. Detect exact and near-duplicates, extract text from scanned documents with OCR, process email archives (PST, MSG, EML), and apply redactions across entire document sets.",
  },
  {
    Icon: Users,
    title: "Collaborative Review Workflow",
    text: "Structured tiered review\u00a0\u2014 Reviewer, Senior Reviewer, Final Approver. Full version comparison between original, draft redacted, and final versions. Every decision tracked with change history and reasoning.",
  },
  {
    Icon: FileCheck,
    title: "Immutable Audit Trail",
    text: "Every action logged with user ID, timestamp, reasoning, and withholding ground. Tamper-evident hash chain ensures integrity. Generate chain-of-custody reports for the Ombudsman at any point.",
  },
  {
    Icon: Zap,
    title: "Rapid Deployment",
    text: "Cloud-native SaaS hosted in Azure\u2019s New Zealand region. No infrastructure to provision or manage. Onboard your team in days with Azure AD single sign-on and SCIM automated user provisioning.",
  },
];

const SCREENSHOTS = [
  { Icon: Monitor, label: "Dashboard Overview" },
  { Icon: FileSearch, label: "Document Review" },
  { Icon: Brain, label: "AI Detection Panel" },
  { Icon: Download, label: "Export & Compliance" },
];

const STEPS = [
  {
    Icon: Upload,
    title: "Ingest",
    text: "Upload documents individually, in bulk, or via M365 integration. Support for PDF, DOCX, XLSX, email archives (PST, MSG, EML), and scanned documents with intelligent OCR.",
  },
  {
    Icon: Brain,
    title: "AI Analysis",
    text: "AI models analyse every page with contextual reasoning\u00a0\u2014 not just pattern matching. Each detection includes confidence scores, suggested LGOIMA withholding grounds, and public interest considerations.",
  },
  {
    Icon: CheckCircle,
    title: "Human Review",
    text: "Tiered review workflow across Reviewer, Senior Reviewer, and Final Approver roles. Accept, reject, or modify AI recommendations with full change tracking and version comparison.",
  },
  {
    Icon: Send,
    title: "Compliant Release",
    text: "Export redacted documents with permanent, irreversible redactions. Auto-generate withholding schedules, cover letters, and Ombudsman-ready audit reports\u00a0\u2014 all in one click.",
  },
];

const COMPLIANCE_BADGES = [
  "LGOIMA 1987",
  "Privacy Act 2020",
  "Public Records Act 2005",
  "NZ Web Standards",
];

const SECURITY_FEATURES = [
  { Icon: Globe, text: "Azure NZ Region\u00a0\u2014 data never leaves New Zealand" },
  { Icon: Lock, text: "Azure AD / Entra ID single sign-on" },
  { Icon: KeyRound, text: "AES-256 encryption at rest and in transit" },
  { Icon: UserCog, text: "SCIM automated user provisioning" },
  { Icon: ShieldCheck, text: "Role-based access control (RBAC)" },
  { Icon: Server, text: "SOC 2 Type II compliant infrastructure" },
];

/* ================================================================== */
/*  LANDING PAGE                                                       */
/* ================================================================== */
export default function LandingPage() {
  /* --- nav scroll state --- */
  const [scrolled, setScrolled] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 40);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  /* --- form state --- */
  const [form, setForm] = useState({ name: "", email: "", organisation: "", message: "" });
  const [formStatus, setFormStatus] = useState<"idle" | "sending" | "success" | "error">("idle");
  const [formError, setFormError] = useState("");

  const handleField = useCallback(
    (field: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      setForm((f) => ({ ...f, [field]: e.target.value })),
    []
  );

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setFormError("");
    if (!form.name.trim() || !form.email.trim() || !form.organisation.trim()) {
      setFormError("Please fill in all required fields.");
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) {
      setFormError("Please enter a valid email address.");
      return;
    }
    setFormStatus("sending");
    try {
      const res = await fetch("/api/demo-request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Request failed");
      }
      setFormStatus("success");
    } catch (err: unknown) {
      setFormError(err instanceof Error ? err.message : "Something went wrong. Please try again.");
      setFormStatus("error");
    }
  }

  /* --- section reveal refs --- */
  const feat = useReveal();
  const shots = useReveal();
  const steps = useReveal();
  const sec = useReveal();
  const cta = useReveal();

  /* ---------------------------------------------------------------- */
  return (
    <div className="min-h-screen bg-surface-bg overflow-x-hidden">
      {/* ============================================================ */}
      {/*  NAVIGATION                                                   */}
      {/* ============================================================ */}
      <nav
        aria-label="Main navigation"
        className={`fixed top-0 inset-x-0 z-50 transition-all duration-300 ${
          scrolled
            ? "bg-white/80 backdrop-blur-xl shadow-[0_1px_0_rgba(62,19,175,.08)]"
            : "bg-transparent"
        }`}
      >
        <div className="max-w-7xl mx-auto flex items-center justify-between px-6 h-16">
          {/* Logo */}
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-full bg-brand-primary flex items-center justify-center flex-shrink-0">
              <EyeOff className="w-[18px] h-[18px] text-white" />
            </div>
            <div className="flex items-baseline gap-2">
              <span className="text-lg font-heading font-bold text-txt-primary tracking-tight">
                Veil
              </span>
              <span className="hidden sm:inline text-[11px] font-body text-txt-secondary tracking-wide uppercase">
                A Clarivus Product
              </span>
            </div>
          </div>

          {/* Desktop links */}
          <div className="hidden lg:flex items-center gap-1">
            {NAV_LINKS.map((l) => (
              <button
                key={l.id}
                onClick={() => scrollTo(l.id)}
                className="px-3 py-1.5 text-sm font-medium text-txt-secondary hover:text-brand-primary transition-colors rounded-md"
              >
                {l.label}
              </button>
            ))}
          </div>

          {/* Desktop CTAs */}
          <div className="hidden lg:flex items-center gap-3">
            <Link
              href="/login"
              className="px-4 py-2 text-sm font-medium text-txt-secondary hover:text-brand-primary transition-colors"
            >
              Sign In
            </Link>
            <button
              onClick={() => scrollTo("contact")}
              className="btn-primary flex items-center gap-1.5 text-sm"
            >
              Request Demo
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Mobile hamburger */}
          <button
            onClick={() => setMobileOpen((v) => !v)}
            className="lg:hidden p-2 -mr-2 text-txt-primary"
            aria-label={mobileOpen ? "Close menu" : "Open menu"}
            aria-expanded={mobileOpen}
          >
            {mobileOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
        </div>

        {/* Mobile menu */}
        {mobileOpen && (
          <div className="lg:hidden bg-white/95 backdrop-blur-xl border-t border-border px-6 py-4 space-y-1">
            {NAV_LINKS.map((l) => (
              <button
                key={l.id}
                onClick={() => {
                  scrollTo(l.id);
                  setMobileOpen(false);
                }}
                className="block w-full text-left px-3 py-2.5 text-sm font-medium text-txt-secondary hover:text-brand-primary rounded-md"
              >
                {l.label}
              </button>
            ))}
            <div className="pt-3 border-t border-border flex flex-col gap-2">
              <Link
                href="/login"
                className="text-center px-4 py-2.5 text-sm font-medium text-txt-secondary border border-border rounded-input"
              >
                Sign In
              </Link>
              <button
                onClick={() => {
                  scrollTo("contact");
                  setMobileOpen(false);
                }}
                className="btn-primary text-center text-sm"
              >
                Request Demo
              </button>
            </div>
          </div>
        )}
      </nav>

      {/* ============================================================ */}
      {/*  HERO                                                         */}
      {/* ============================================================ */}
      <section
        className="relative min-h-[100dvh] flex items-center overflow-hidden"
        style={{
          background: "linear-gradient(135deg, #3e13af 0%, #5a3cc4 40%, #7c3aed 100%)",
        }}
      >
        {/* Noise texture overlay */}
        <div
          className="absolute inset-0 opacity-[0.035] pointer-events-none"
          style={{
            backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='.85' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E")`,
            backgroundSize: "128px 128px",
          }}
        />

        {/* Geometric decorative elements */}
        <div className="absolute inset-0 overflow-hidden pointer-events-none" aria-hidden="true">
          {/* Large ring */}
          <div
            className="absolute -right-32 top-1/2 -translate-y-1/2 w-[600px] h-[600px] rounded-full border border-white/[0.07]"
            style={{ animation: "hero-float 20s ease-in-out infinite" }}
          />
          {/* Medium ring */}
          <div
            className="absolute -right-16 top-1/2 -translate-y-1/2 w-[420px] h-[420px] rounded-full border border-white/[0.05]"
            style={{ animation: "hero-float 20s ease-in-out infinite 3s" }}
          />
          {/* Small solid circle */}
          <div
            className="absolute right-[8%] top-[18%] w-3 h-3 rounded-full bg-white/20"
            style={{ animation: "hero-float 8s ease-in-out infinite 1s" }}
          />
          <div
            className="absolute right-[22%] bottom-[22%] w-2 h-2 rounded-full bg-white/15"
            style={{ animation: "hero-float 10s ease-in-out infinite 2s" }}
          />
          {/* Diagonal line accent */}
          <div
            className="absolute top-0 right-[30%] w-px h-[40%] bg-gradient-to-b from-transparent via-white/[0.06] to-transparent"
            style={{ transform: "rotate(15deg)", transformOrigin: "top center" }}
          />
          <div
            className="absolute bottom-0 left-[15%] w-px h-[30%] bg-gradient-to-t from-transparent via-white/[0.04] to-transparent"
            style={{ transform: "rotate(-10deg)", transformOrigin: "bottom center" }}
          />
        </div>

        {/* Content */}
        <div className="relative max-w-7xl mx-auto px-6 pt-28 pb-20 lg:pt-0 lg:pb-0">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 lg:gap-16 items-center">
            {/* Left — Text */}
            <div>
              <div
                className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/10 border border-white/10 text-white/80 text-xs font-medium mb-8"
                style={{ animation: "fade-in-up 0.7s ease-out both" }}
              >
                <span className="w-1.5 h-1.5 rounded-full bg-brand-accent animate-pulse" />
                Purpose-built for NZ Local Government
              </div>

              <h1
                className="font-heading text-4xl sm:text-5xl lg:text-[3.5rem] font-bold text-white leading-[1.1] tracking-tight"
                style={{ animation: "fade-in-up 0.7s ease-out 0.15s both" }}
              >
                AI-Powered Disclosure.{" "}
                <span className="text-white/60">Compliant. Defensible. Fast.</span>
              </h1>

              <p
                className="mt-6 text-base sm:text-lg text-white/70 leading-relaxed max-w-xl font-body"
                style={{ animation: "fade-in-up 0.7s ease-out 0.3s both" }}
              >
                Veil automates the detection and redaction of sensitive information in LGOIMA
                responses&nbsp;&mdash; transforming weeks of manual review into hours of intelligent,
                auditable workflow. Process thousands of documents with AI that understands
                New Zealand legislation.
              </p>

              {/* Stats row */}
              <div
                className="mt-8 grid grid-cols-3 gap-4 max-w-md"
                style={{ animation: "fade-in-up 0.7s ease-out 0.38s both" }}
              >
                <div>
                  <div className="text-2xl sm:text-3xl font-heading font-bold text-white">10k+</div>
                  <div className="text-xs text-white/50 mt-0.5">Documents per request</div>
                </div>
                <div>
                  <div className="text-2xl sm:text-3xl font-heading font-bold text-white">23</div>
                  <div className="text-xs text-white/50 mt-0.5">LGOIMA grounds</div>
                </div>
                <div>
                  <div className="text-2xl sm:text-3xl font-heading font-bold text-white">100%</div>
                  <div className="text-xs text-white/50 mt-0.5">NZ data sovereignty</div>
                </div>
              </div>

              <div
                className="mt-10 flex flex-wrap gap-4"
                style={{ animation: "fade-in-up 0.7s ease-out 0.45s both" }}
              >
                <button
                  onClick={() => scrollTo("contact")}
                  className="inline-flex items-center gap-2 px-6 py-3 bg-white text-brand-primary font-semibold text-sm rounded-input hover:bg-white/90 transition-colors"
                >
                  Request a Demo
                  <ArrowRight className="w-4 h-4" />
                </button>
                <button
                  onClick={() => scrollTo("features")}
                  className="inline-flex items-center gap-2 px-6 py-3 border border-white/25 text-white font-medium text-sm rounded-input hover:bg-white/10 transition-colors"
                >
                  Learn More
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Right — Layered screenshot placeholders */}
            <div
              className="hidden lg:block relative"
              style={{ animation: "fade-in-up 0.9s ease-out 0.5s both" }}
              aria-hidden="true"
            >
              <div className="relative w-full aspect-[4/3]">
                {/* Back card — Dashboard */}
                <div
                  className="absolute top-0 right-0 w-[85%] aspect-[16/10] rounded-xl bg-white/[0.07] border border-white/10 backdrop-blur-sm shadow-2xl overflow-hidden"
                  style={{ transform: "rotate(2deg) translateY(8px)" }}
                >
                  <div className="h-7 bg-white/[0.05] border-b border-white/[0.06] flex items-center px-3 gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-white/20" />
                    <span className="w-2 h-2 rounded-full bg-white/15" />
                    <span className="w-2 h-2 rounded-full bg-white/10" />
                    <span className="ml-3 text-[9px] text-white/30 font-mono">veil.local.govt.nz/dashboard</span>
                  </div>
                  <div className="p-4 space-y-3">
                    <div className="flex gap-3">
                      <div className="h-16 flex-1 rounded-lg bg-white/[0.04] border border-white/[0.06]" />
                      <div className="h-16 flex-1 rounded-lg bg-white/[0.04] border border-white/[0.06]" />
                      <div className="h-16 flex-1 rounded-lg bg-white/[0.04] border border-white/[0.06]" />
                    </div>
                    <div className="h-24 rounded-lg bg-white/[0.03] border border-white/[0.06]" />
                  </div>
                </div>

                {/* Front card — Document Review */}
                <div
                  className="absolute bottom-0 left-0 w-[85%] aspect-[16/10] rounded-xl bg-white/[0.10] border border-white/[0.12] backdrop-blur-md shadow-2xl overflow-hidden"
                  style={{ transform: "rotate(-1deg)" }}
                >
                  <div className="h-7 bg-white/[0.06] border-b border-white/[0.08] flex items-center px-3 gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-white/20" />
                    <span className="w-2 h-2 rounded-full bg-white/15" />
                    <span className="w-2 h-2 rounded-full bg-white/10" />
                    <span className="ml-3 text-[9px] text-white/30 font-mono">veil.local.govt.nz/review</span>
                  </div>
                  <div className="p-4 flex gap-3">
                    {/* Document preview area */}
                    <div className="flex-1 rounded-lg bg-white/[0.05] border border-white/[0.08] p-3 space-y-2">
                      <div className="h-2 w-3/4 rounded bg-white/10" />
                      <div className="h-2 w-full rounded bg-white/[0.06]" />
                      <div className="h-2 w-5/6 rounded bg-white/[0.06]" />
                      <div className="h-3 w-1/2 rounded bg-brand-accent/30 mt-1" />
                      <div className="h-2 w-full rounded bg-white/[0.06]" />
                      <div className="h-3 w-2/3 rounded bg-red-400/20 mt-1" />
                      <div className="h-2 w-4/5 rounded bg-white/[0.06]" />
                    </div>
                    {/* Detection sidebar */}
                    <div className="w-28 rounded-lg bg-white/[0.04] border border-white/[0.08] p-2 space-y-1.5">
                      <div className="h-2 w-full rounded bg-white/10" />
                      <div className="h-6 rounded bg-brand-accent/20 border border-brand-accent/30" />
                      <div className="h-6 rounded bg-amber-400/15 border border-amber-400/25" />
                      <div className="h-6 rounded bg-red-400/15 border border-red-400/25" />
                      <div className="h-6 rounded bg-brand-accent/20 border border-brand-accent/30" />
                    </div>
                  </div>
                </div>

                {/* Floating badge */}
                <div className="absolute -bottom-3 right-8 px-3 py-1.5 rounded-full bg-brand-accent/90 text-white text-[10px] font-semibold shadow-lg flex items-center gap-1.5">
                  <Shield className="w-3 h-3" />
                  2,156 detections found
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Bottom fade */}
        <div className="absolute bottom-0 inset-x-0 h-24 bg-gradient-to-t from-surface-bg to-transparent" />
      </section>

      {/* ============================================================ */}
      {/*  FEATURES                                                     */}
      {/* ============================================================ */}
      <section id="features" className="py-24 lg:py-32" ref={feat.ref}>
        <div
          className={`max-w-7xl mx-auto px-6 transition-all duration-700 ${
            feat.visible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-8"
          }`}
        >
          <div className="text-center max-w-2xl mx-auto mb-16">
            <h2 className="font-heading text-3xl sm:text-4xl font-bold text-txt-primary">
              Purpose-Built for LGOIMA Disclosure
            </h2>
            <p className="mt-4 text-txt-secondary text-base leading-relaxed">
              Not a generic redaction tool. Veil is a defensible digital disclosure workflow platform
              designed around the specific requirements of New Zealand&apos;s LGOIMA legislation.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {FEATURES.map((f, i) => (
              <div
                key={f.title}
                className="group relative bg-white border border-border rounded-card p-6 hover:shadow-lg hover:-translate-y-0.5 transition-all duration-300"
                style={{
                  transitionDelay: feat.visible ? `${i * 80}ms` : "0ms",
                  opacity: feat.visible ? 1 : 0,
                  transform: feat.visible ? "translateY(0)" : "translateY(12px)",
                }}
              >
                {/* Purple left accent */}
                <div className="absolute left-0 top-6 bottom-6 w-[3px] rounded-full bg-brand-primary/20 group-hover:bg-brand-primary transition-colors duration-300" />

                <div className="pl-3">
                  <div className="w-10 h-10 rounded-lg bg-brand-primary/[0.07] flex items-center justify-center mb-4">
                    <f.Icon className="w-5 h-5 text-brand-primary" />
                  </div>
                  <h3 className="font-heading text-lg font-semibold text-txt-primary mb-2">
                    {f.title}
                  </h3>
                  <p className="text-sm text-txt-secondary leading-relaxed">{f.text}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ============================================================ */}
      {/*  SCREENSHOTS / PRODUCT PREVIEW                                */}
      {/* ============================================================ */}
      <section
        id="product"
        className="py-24 lg:py-32 bg-gradient-to-b from-surface-bg to-white"
        ref={shots.ref}
      >
        <div
          className={`max-w-7xl mx-auto px-6 transition-all duration-700 ${
            shots.visible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-8"
          }`}
        >
          <div className="text-center max-w-2xl mx-auto mb-16">
            <h2 className="font-heading text-3xl sm:text-4xl font-bold text-txt-primary">
              See Veil in Action
            </h2>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 max-w-4xl mx-auto">
            {SCREENSHOTS.map((s, i) => (
              <div
                key={s.label}
                className="aspect-[16/10] rounded-card border-2 border-dashed border-brand-primary/15 bg-brand-primary/[0.02] flex flex-col items-center justify-center gap-3 hover:border-brand-primary/30 hover:bg-brand-primary/[0.04] transition-all duration-300"
                style={{
                  transitionDelay: shots.visible ? `${i * 100}ms` : "0ms",
                  opacity: shots.visible ? 1 : 0,
                  transform: shots.visible ? "scale(1)" : "scale(0.96)",
                }}
              >
                <div className="w-12 h-12 rounded-full bg-brand-primary/[0.06] flex items-center justify-center">
                  <s.Icon className="w-6 h-6 text-brand-primary/50" />
                </div>
                <span className="text-sm font-medium text-txt-secondary">{s.label}</span>
              </div>
            ))}
          </div>

          <p className="text-center text-xs text-txt-secondary/60 mt-8">
            Screenshots from the Veil platform
          </p>
        </div>
      </section>

      {/* ============================================================ */}
      {/*  HOW IT WORKS                                                 */}
      {/* ============================================================ */}
      <section id="how-it-works" className="py-24 lg:py-32 bg-white" ref={steps.ref}>
        <div
          className={`max-w-7xl mx-auto px-6 transition-all duration-700 ${
            steps.visible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-8"
          }`}
        >
          <div className="text-center max-w-2xl mx-auto mb-16">
            <h2 className="font-heading text-3xl sm:text-4xl font-bold text-txt-primary">
              From Ingestion to Compliant Release
            </h2>
            <p className="mt-4 text-txt-secondary text-base leading-relaxed">
              A structured four-stage pipeline that takes raw documents to Ombudsman-ready
              disclosure packages with full audit trail at every step.
            </p>
          </div>

          <div className="relative">
            {/* Connector line (desktop) */}
            <div
              className="hidden lg:block absolute top-[52px] left-[calc(12.5%+24px)] right-[calc(12.5%+24px)] h-px bg-border"
              aria-hidden="true"
            />

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-8 lg:gap-6">
              {STEPS.map((s, i) => (
                <div
                  key={s.title}
                  className="relative text-center"
                  style={{
                    transitionDelay: steps.visible ? `${i * 120}ms` : "0ms",
                    opacity: steps.visible ? 1 : 0,
                    transform: steps.visible ? "translateY(0)" : "translateY(16px)",
                    transition: "opacity 0.5s ease, transform 0.5s ease",
                  }}
                >
                  {/* Number badge */}
                  <div className="relative mx-auto w-[104px] h-[104px] rounded-2xl bg-brand-primary/[0.05] border border-brand-primary/10 flex items-center justify-center mb-5">
                    <span className="absolute -top-2.5 -right-2.5 w-7 h-7 rounded-full bg-brand-primary text-white text-xs font-bold flex items-center justify-center shadow-sm">
                      {i + 1}
                    </span>
                    <s.Icon className="w-8 h-8 text-brand-primary" />
                  </div>

                  <h3 className="font-heading text-lg font-semibold text-txt-primary mb-2">
                    {s.title}
                  </h3>
                  <p className="text-sm text-txt-secondary leading-relaxed max-w-[260px] mx-auto">
                    {s.text}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ============================================================ */}
      {/*  SECURITY & COMPLIANCE                                        */}
      {/* ============================================================ */}
      <section id="security" className="relative py-24 lg:py-32 overflow-hidden" ref={sec.ref}>
        {/* Purple background */}
        <div
          className="absolute inset-0"
          style={{
            background: "linear-gradient(160deg, #3e13af 0%, #2d0e80 100%)",
          }}
        />
        {/* Subtle pattern */}
        <div
          className="absolute inset-0 opacity-[0.03] pointer-events-none"
          style={{
            backgroundImage: `url("data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%23ffffff' fill-opacity='1'%3E%3Cpath d='M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E")`,
          }}
        />

        <div
          className={`relative max-w-7xl mx-auto px-6 transition-all duration-700 ${
            sec.visible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-8"
          }`}
        >
          <div className="text-center mb-16">
            <h2 className="font-heading text-3xl sm:text-4xl font-bold text-white">
              Enterprise Security. NZ&nbsp;Data&nbsp;Sovereignty.
            </h2>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 lg:gap-16">
            {/* Left column */}
            <div>
              <p className="text-white/70 text-base leading-relaxed mb-8">
                Veil runs entirely within Azure&apos;s New Zealand North region with disaster recovery
                in Australia East. Your documents, AI processing, and audit data never leave
                NZ shores. Built on enterprise-grade infrastructure with encryption at every layer,
                role-based access control, and automated compliance with the Privacy Act 2020,
                LGOIMA 1987, and the Public Records Act 2005.
              </p>

              <div className="flex flex-wrap gap-2">
                {COMPLIANCE_BADGES.map((badge) => (
                  <span
                    key={badge}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white/10 border border-white/10 text-white text-xs font-medium"
                  >
                    <Check className="w-3 h-3 text-brand-accent-light" />
                    {badge}
                  </span>
                ))}
              </div>
            </div>

            {/* Right column */}
            <div className="space-y-4">
              {SECURITY_FEATURES.map((sf) => (
                <div
                  key={sf.text}
                  className="flex items-start gap-3 text-white/80"
                >
                  <div className="w-8 h-8 rounded-lg bg-white/[0.08] flex items-center justify-center flex-shrink-0 mt-0.5">
                    <sf.Icon className="w-4 h-4 text-white/70" />
                  </div>
                  <span className="text-sm leading-relaxed pt-1">{sf.text}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ============================================================ */}
      {/*  DEMO REQUEST FORM                                            */}
      {/* ============================================================ */}
      <section id="contact" className="py-24 lg:py-32" ref={cta.ref}>
        <div
          className={`max-w-7xl mx-auto px-6 transition-all duration-700 ${
            cta.visible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-8"
          }`}
        >
          <div className="max-w-lg mx-auto">
            <div className="text-center mb-10">
              <h2 className="font-heading text-3xl sm:text-4xl font-bold text-txt-primary">
                Request a Demo
              </h2>
              <p className="mt-4 text-txt-secondary text-base">
                See how Veil can transform your LGOIMA disclosure workflow.
              </p>
            </div>

            {formStatus === "success" ? (
              <div className="card text-center py-12">
                <div className="w-14 h-14 rounded-full bg-brand-accent/10 flex items-center justify-center mx-auto mb-4">
                  <CheckCircle className="w-7 h-7 text-brand-accent" />
                </div>
                <h3 className="font-heading text-xl font-semibold text-txt-primary mb-2">
                  Thank you!
                </h3>
                <p className="text-txt-secondary text-sm">
                  We&apos;ll be in touch within 24 hours.
                </p>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="card" aria-label="Demo request form">
                {(formError || formStatus === "error") && (
                  <div
                    role="alert"
                    className="mb-5 p-3 rounded-card bg-red-50 border border-red-200 text-sm text-red-700"
                  >
                    {formError || "Something went wrong. Please try again."}
                  </div>
                )}

                <div className="space-y-5">
                  <div>
                    <label
                      htmlFor="demo-name"
                      className="block text-sm font-medium text-txt-primary mb-1.5"
                    >
                      Name <span className="text-red-500">*</span>
                    </label>
                    <input
                      id="demo-name"
                      type="text"
                      className="input-field"
                      placeholder="Your full name"
                      value={form.name}
                      onChange={handleField("name")}
                      required
                      aria-required="true"
                      autoComplete="name"
                    />
                  </div>

                  <div>
                    <label
                      htmlFor="demo-email"
                      className="block text-sm font-medium text-txt-primary mb-1.5"
                    >
                      Email <span className="text-red-500">*</span>
                    </label>
                    <input
                      id="demo-email"
                      type="email"
                      className="input-field"
                      placeholder="you@council.govt.nz"
                      value={form.email}
                      onChange={handleField("email")}
                      required
                      aria-required="true"
                      autoComplete="email"
                    />
                  </div>

                  <div>
                    <label
                      htmlFor="demo-org"
                      className="block text-sm font-medium text-txt-primary mb-1.5"
                    >
                      Organisation <span className="text-red-500">*</span>
                    </label>
                    <input
                      id="demo-org"
                      type="text"
                      className="input-field"
                      placeholder="e.g. District Council"
                      value={form.organisation}
                      onChange={handleField("organisation")}
                      required
                      aria-required="true"
                      autoComplete="organization"
                    />
                  </div>

                  <div>
                    <label
                      htmlFor="demo-message"
                      className="block text-sm font-medium text-txt-primary mb-1.5"
                    >
                      Message
                    </label>
                    <textarea
                      id="demo-message"
                      rows={4}
                      className="input-field resize-none"
                      placeholder="Tell us about your disclosure workflow or any specific requirements..."
                      value={form.message}
                      onChange={handleField("message")}
                    />
                  </div>

                  <button
                    type="submit"
                    disabled={formStatus === "sending"}
                    className="btn-primary w-full flex items-center justify-center gap-2"
                  >
                    {formStatus === "sending" ? (
                      <>
                        <span
                          className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"
                          aria-hidden="true"
                        />
                        Sending...
                      </>
                    ) : (
                      <>
                        Send Request
                        <Send className="w-4 h-4" />
                      </>
                    )}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      </section>

      {/* ============================================================ */}
      {/*  FOOTER                                                       */}
      {/* ============================================================ */}
      <footer className="bg-[#1a1523] text-white/60" role="contentinfo">
        <div className="max-w-7xl mx-auto px-6 py-12">
          <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-8">
            {/* Left */}
            <div className="flex items-center gap-4">
              <Image
                src="/images/Datasing_Logo-02.svg"
                alt="DataSing"
                width={100}
                height={28}
                className="brightness-0 invert opacity-70"
              />
              <span className="text-xs text-white/40">A DataSing Clarivus Product</span>
            </div>

            {/* Links */}
            <div className="flex flex-wrap gap-6 text-xs">
              <button
                onClick={() => scrollTo("features")}
                className="hover:text-white transition-colors"
              >
                Features
              </button>
              <button
                onClick={() => scrollTo("security")}
                className="hover:text-white transition-colors"
              >
                Security
              </button>
              <button
                onClick={() => scrollTo("contact")}
                className="hover:text-white transition-colors"
              >
                Contact
              </button>
              <Link href="/login" className="hover:text-white transition-colors">
                Sign In
              </Link>
            </div>
          </div>

          <div className="mt-8 pt-6 border-t border-white/[0.06] flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-white/30">
            <p>&copy; {new Date().getFullYear()} DataSing Ltd. All rights reserved.</p>
            <p>Veil is part of the Clarivus AI suite.</p>
          </div>
        </div>
      </footer>

    </div>
  );
}
