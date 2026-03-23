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
  Brain,
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
  AlertTriangle,
  Clock,
  TrendingUp,
  Quote,
} from "lucide-react";

/* ------------------------------------------------------------------ */
/*  Scroll-reveal hook                                                 */
/* ------------------------------------------------------------------ */
function useReveal(threshold = 0.1) {
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
      { threshold }
    );
    io.observe(el);
    return () => io.disconnect();
  }, [threshold]);

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
  { label: "Product", id: "product" },
  { label: "How It Works", id: "how-it-works" },
  { label: "Security", id: "security" },
  { label: "Contact", id: "contact" },
];

const PAIN_POINTS = [
  {
    Icon: Layers,
    title: "Volume overload",
    text: "1,000\u201310,000+ documents per request. Manual review simply cannot scale.",
  },
  {
    Icon: Users,
    title: "Consistency gap",
    text: "Different staff apply redactions differently. No standardised workflow across the organisation.",
  },
  {
    Icon: Shield,
    title: "Defensibility risk",
    text: "No structured audit trail linking each redaction to statutory grounds. Ombudsman challenges are hard to defend.",
  },
  {
    Icon: Clock,
    title: "Deadline pressure",
    text: "20 working days per request. Every LGOIMA response is a ticking clock.",
  },
  {
    Icon: AlertTriangle,
    title: "Double-edged risk",
    text: "Miss a redaction = privacy breach. Over-redact = withholding official information. Both carry legal and reputational consequences.",
  },
];

const FEATURES = [
  {
    Icon: Brain,
    title: "AI Detection with Human Oversight",
    text: "Two-layer detection: NZ-specific pattern matching (IRD, NHI, phone, address) plus contextual AI that understands commercially sensitive content, legal privilege, and free & frank opinions. Every detection is a recommendation\u00a0\u2014 humans always decide.",
  },
  {
    Icon: Scale,
    title: "Full LGOIMA Compliance",
    text: "Every redaction linked to statutory grounds (s6, s7, s17). Public interest consideration enforced for s7 grounds. Withholding schedules generated automatically. Reviewers cannot export without linking redactions to statutory grounds.",
  },
  {
    Icon: Users,
    title: "Tiered Review Workflow",
    text: "Reviewer \u2192 Senior Reviewer \u2192 Final Approver. The same workflow your council uses, built into the system. Full version comparison, change tracking, and role-based permissions at every stage.",
  },
  {
    Icon: Lock,
    title: "Permanent, Verified Redaction",
    text: "Content removed at the data level, not overlaid. Multi-pass verification confirms no residual content survives. If any check fails, export is blocked until resolved.",
  },
  {
    Icon: FileCheck,
    title: "Immutable Audit Trail",
    text: "Every action logged with user ID, timestamp, and reasoning. SHA-256 hash chain for tamper detection. Ombudsman-ready export packages. There is no \u2018off the record\u2019 mode.",
  },
  {
    Icon: Layers,
    title: "Bulk Processing at Scale",
    text: "Process 5,000 pages in under 3 hours. Detect duplicates across 10,000 documents in 45 minutes. Support 10+ concurrent reviewers. OCR for scanned documents and handwriting.",
  },
];

const SCREENSHOTS = [
  {
    src: "/screenshots/dashboard.png",
    label: "Dashboard Overview",
    description: "Active cases, document counts, deadlines, and team activity at a glance",
    alt: "Veil dashboard showing active LGOIMA cases, document counts, deadlines, and recent activity feed",
  },
  {
    src: "/screenshots/document-review-report.png",
    label: "Document Review",
    description: "Side-by-side original and redacted views with AI-detected PII highlighted",
    alt: "Side-by-side document review showing original and redacted views with highlighted detections",
  },
  {
    src: "/screenshots/document-review-email.png",
    label: "AI Detection Panel",
    description: "Confidence scores, withholding grounds, and one-click accept/reject for each detection",
    alt: "AI detection panel showing entities with confidence scores, grounds, and accept/reject actions",
  },
  {
    src: "/screenshots/reports.png",
    label: "Reports & Compliance",
    description: "AI accuracy metrics, compliance analytics, and downloadable report templates",
    alt: "Reports page with AI detection performance metrics and compliance report templates",
  },
];

const STEPS = [
  {
    Icon: Upload,
    title: "Ingest",
    text: "Upload documents individually, in bulk, or via M365 integration. PDF, DOCX, XLSX, email archives (PST, MSG, EML), and scanned documents with intelligent OCR.",
  },
  {
    Icon: Brain,
    title: "AI Analysis",
    text: "AI models analyse every page with contextual reasoning. Each detection includes confidence scores, suggested LGOIMA withholding grounds, and public interest considerations.",
  },
  {
    Icon: CheckCircle,
    title: "Human Review",
    text: "Tiered workflow: Reviewer, Senior Reviewer, Final Approver. Accept, reject, or modify AI recommendations with full change tracking and version comparison.",
  },
  {
    Icon: Send,
    title: "Compliant Release",
    text: "Export with permanent, verified redactions. Auto-generate withholding schedules, cover letters, and Ombudsman-ready audit reports\u00a0\u2014 all in one click.",
  },
];

const METRICS = [
  { value: "60\u201370%", label: "Reduction in manual effort", suffix: "" },
  { value: "200\u2013280", label: "Staff hours saved annually", suffix: "hrs" },
  { value: "5,000", label: "Pages processed in under 3 hours", suffix: "pages" },
  { value: "99.5%", label: "Uptime SLA", suffix: "" },
];

const COMPLIANCE_BADGES = [
  "LGOIMA 1987",
  "Privacy Act 2020",
  "Public Records Act 2005",
  "NZ Web Standards",
  "OWASP Top 10",
];

const SECURITY_FEATURES = [
  { Icon: Globe, text: "Azure NZ North region\u00a0\u2014 data never leaves New Zealand" },
  { Icon: Lock, text: "Azure AD / Entra ID single sign-on with MFA" },
  { Icon: KeyRound, text: "AES-256 encryption at rest and in transit" },
  { Icon: UserCog, text: "SCIM 2.0 automated user provisioning" },
  { Icon: ShieldCheck, text: "Role-based access control (6 distinct roles)" },
  { Icon: Server, text: "SOC 2 Type II compliant infrastructure" },
];

/* ================================================================== */
/*  LANDING PAGE                                                       */
/* ================================================================== */
export default function LandingPage() {
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
  const problem = useReveal();
  const feat = useReveal();
  const shots = useReveal();
  const steps = useReveal();
  const metrics = useReveal();
  const quote = useReveal();
  const sec = useReveal();
  const cta = useReveal();

  /* ---------------------------------------------------------------- */
  return (
    <div className="min-h-screen bg-white overflow-x-hidden">
      {/* ============================================================ */}
      {/*  NAVIGATION                                                   */}
      {/* ============================================================ */}
      <nav
        aria-label="Main navigation"
        className={`fixed top-0 inset-x-0 z-50 transition-all duration-300 ${
          scrolled
            ? "bg-white/90 backdrop-blur-xl shadow-[0_1px_3px_rgba(62,19,175,.06)]"
            : "bg-transparent"
        }`}
      >
        <div className="max-w-7xl mx-auto flex items-center justify-between px-6 h-16">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-full bg-brand-primary flex items-center justify-center flex-shrink-0">
              <EyeOff className="w-[18px] h-[18px] text-white" />
            </div>
            <div className="flex items-baseline gap-2">
              <span
                className={`text-lg font-heading font-bold tracking-tight transition-colors duration-300 ${
                  scrolled ? "text-txt-primary" : "text-white"
                }`}
              >
                Veil
              </span>
              <span
                className={`hidden sm:inline text-[11px] font-body tracking-wide uppercase transition-colors duration-300 ${
                  scrolled ? "text-txt-secondary" : "text-white/60"
                }`}
              >
                A Clarivus Product
              </span>
            </div>
          </div>

          <div className="hidden lg:flex items-center gap-1">
            {NAV_LINKS.map((l) => (
              <button
                key={l.id}
                onClick={() => scrollTo(l.id)}
                className={`px-3 py-1.5 text-sm font-medium transition-colors rounded-md ${
                  scrolled
                    ? "text-txt-secondary hover:text-brand-primary"
                    : "text-white/70 hover:text-white"
                }`}
              >
                {l.label}
              </button>
            ))}
          </div>

          <div className="hidden lg:flex items-center gap-3">
            <Link
              href="/login"
              className={`px-4 py-2 text-sm font-medium transition-colors ${
                scrolled
                  ? "text-txt-secondary hover:text-brand-primary"
                  : "text-white/70 hover:text-white"
              }`}
            >
              Sign In
            </Link>
            <button
              onClick={() => scrollTo("contact")}
              className={`flex items-center gap-1.5 text-sm font-semibold px-4 py-2 rounded-input transition-colors ${
                scrolled
                  ? "bg-brand-primary text-white hover:bg-brand-primary-dark"
                  : "bg-white text-brand-primary hover:bg-white/90"
              }`}
            >
              Request Demo
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>

          <button
            onClick={() => setMobileOpen((v) => !v)}
            className={`lg:hidden p-2 -mr-2 transition-colors ${
              scrolled ? "text-txt-primary" : "text-white"
            }`}
            aria-label={mobileOpen ? "Close menu" : "Open menu"}
            aria-expanded={mobileOpen}
          >
            {mobileOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
        </div>

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
      <section className="relative overflow-hidden" style={{ background: "linear-gradient(145deg, #1a0940 0%, #3e13af 45%, #5a2dd6 100%)" }}>
        {/* Grain texture */}
        <div
          className="absolute inset-0 opacity-[0.04] pointer-events-none mix-blend-overlay"
          style={{
            backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='.8' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E")`,
            backgroundSize: "128px 128px",
          }}
        />

        {/* Geometric accents */}
        <div className="absolute inset-0 overflow-hidden pointer-events-none" aria-hidden="true">
          <div className="absolute -right-40 top-1/3 w-[700px] h-[700px] rounded-full border border-white/[0.04]" />
          <div className="absolute -right-20 top-1/3 w-[500px] h-[500px] rounded-full border border-white/[0.03]" />
          <div className="absolute left-[10%] top-[15%] w-2 h-2 rounded-full bg-brand-accent/40" />
          <div className="absolute right-[15%] bottom-[25%] w-1.5 h-1.5 rounded-full bg-white/20" />
          <div className="absolute top-0 right-[25%] w-px h-[50%] bg-gradient-to-b from-transparent via-white/[0.04] to-transparent" style={{ transform: "rotate(15deg)" }} />
        </div>

        <div className="relative max-w-7xl mx-auto px-6 pt-32 pb-16 lg:pt-40 lg:pb-8">
          {/* Text content */}
          <div className="max-w-3xl" style={{ animation: "fade-in-up 0.7s ease-out both" }}>
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/[0.08] border border-white/[0.08] text-white/70 text-xs font-medium mb-8 backdrop-blur-sm">
              <span className="w-1.5 h-1.5 rounded-full bg-brand-accent animate-pulse" />
              Purpose-built for NZ Local Government
            </div>

            <h1
              className="font-heading text-4xl sm:text-5xl lg:text-6xl font-bold text-white leading-[1.08] tracking-tight"
              style={{ animation: "fade-in-up 0.7s ease-out 0.12s both" }}
            >
              Not Just Redaction.
              <br />
              <span className="text-white/50">Defensible LGOIMA Disclosure.</span>
            </h1>

            <p
              className="mt-7 text-lg sm:text-xl text-white/65 leading-relaxed max-w-2xl font-body"
              style={{ animation: "fade-in-up 0.7s ease-out 0.24s both" }}
            >
              Veil automates the detection, review, and release of official information&nbsp;&mdash;
              transforming weeks of manual processing into hours of intelligent, auditable workflow.
            </p>
          </div>

          {/* Stats strip */}
          <div
            className="mt-12 flex flex-wrap gap-x-10 gap-y-4"
            style={{ animation: "fade-in-up 0.7s ease-out 0.36s both" }}
          >
            {[
              { num: "10,000+", label: "Docs per request" },
              { num: "23", label: "Statutory grounds" },
              { num: "100%", label: "NZ data sovereignty" },
              { num: "60\u201370%", label: "Time saved" },
            ].map((s) => (
              <div key={s.label} className="flex items-baseline gap-2">
                <span className="text-2xl sm:text-3xl font-heading font-bold text-white">{s.num}</span>
                <span className="text-xs text-white/40 uppercase tracking-wider">{s.label}</span>
              </div>
            ))}
          </div>

          {/* CTAs */}
          <div
            className="mt-10 flex flex-wrap gap-4"
            style={{ animation: "fade-in-up 0.7s ease-out 0.44s both" }}
          >
            <button
              onClick={() => scrollTo("contact")}
              className="inline-flex items-center gap-2 px-7 py-3.5 bg-white text-brand-primary font-semibold text-sm rounded-input hover:bg-white/90 transition-colors shadow-lg shadow-black/10"
            >
              Request a Demo
              <ArrowRight className="w-4 h-4" />
            </button>
            <button
              onClick={() => scrollTo("product")}
              className="inline-flex items-center gap-2 px-7 py-3.5 border border-white/20 text-white font-medium text-sm rounded-input hover:bg-white/[0.06] transition-colors"
            >
              See It in Action
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>

          {/* Hero screenshot — full-width perspective view */}
          <div
            className="mt-16 lg:mt-20 relative mx-auto max-w-5xl"
            style={{ animation: "fade-in-up 0.9s ease-out 0.55s both" }}
          >
            <div
              className="relative rounded-xl overflow-hidden shadow-2xl shadow-black/30 border border-white/[0.08]"
              style={{ perspective: "1200px" }}
            >
              <div style={{ transform: "rotateX(2deg)" }}>
                <Image
                  src="/screenshots/document-review-report.png"
                  alt="Veil document review interface showing side-by-side original and redacted views with AI-detected sensitive information highlighted in the redacted view"
                  width={1200}
                  height={750}
                  className="w-full h-auto"
                  priority
                />
              </div>
            </div>
            {/* Floating indicators */}
            <div className="absolute -bottom-4 left-8 px-3.5 py-2 rounded-lg bg-white shadow-lg shadow-black/10 text-xs font-semibold text-brand-primary flex items-center gap-2 border border-brand-primary/10">
              <Shield className="w-3.5 h-3.5" />
              12 detections &middot; 3 accepted
            </div>
            <div className="absolute -bottom-4 right-8 px-3.5 py-2 rounded-lg bg-brand-accent text-white shadow-lg shadow-black/10 text-xs font-semibold flex items-center gap-2">
              <CheckCircle className="w-3.5 h-3.5" />
              95% avg confidence
            </div>
          </div>
        </div>
        {/* Fade to white */}
        <div className="h-24 bg-gradient-to-b from-transparent to-white" />
      </section>

      {/* ============================================================ */}
      {/*  THE LGOIMA CHALLENGE (Problem Section)                       */}
      {/* ============================================================ */}
      <section className="py-20 lg:py-28" ref={problem.ref}>
        <div
          className={`max-w-7xl mx-auto px-6 transition-all duration-700 ${
            problem.visible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-8"
          }`}
        >
          <div className="max-w-2xl mb-14">
            <p className="text-sm font-semibold text-brand-primary uppercase tracking-wider mb-3">The Challenge</p>
            <h2 className="font-heading text-3xl sm:text-4xl font-bold text-txt-primary leading-tight">
              LGOIMA Disclosure Is Broken
            </h2>
            <p className="mt-4 text-txt-secondary text-base leading-relaxed">
              Councils across New Zealand face the same compounding pressures. Growing request volumes,
              shrinking timelines, and escalating compliance expectations&nbsp;&mdash; met with manual
              processes that weren&apos;t designed for this scale.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {PAIN_POINTS.map((p, i) => (
              <div
                key={p.title}
                className="relative bg-surface-bg rounded-xl p-6 border border-border/60"
                style={{
                  transitionDelay: problem.visible ? `${i * 60}ms` : "0ms",
                  opacity: problem.visible ? 1 : 0,
                  transform: problem.visible ? "translateY(0)" : "translateY(12px)",
                  transition: "opacity 0.5s ease, transform 0.5s ease",
                }}
              >
                <p.Icon className="w-5 h-5 text-brand-primary/60 mb-3" />
                <h3 className="font-heading text-base font-semibold text-txt-primary mb-1.5">{p.title}</h3>
                <p className="text-sm text-txt-secondary leading-relaxed">{p.text}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ============================================================ */}
      {/*  FEATURES                                                     */}
      {/* ============================================================ */}
      <section id="features" className="py-20 lg:py-28 bg-surface-bg" ref={feat.ref}>
        <div
          className={`max-w-7xl mx-auto px-6 transition-all duration-700 ${
            feat.visible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-8"
          }`}
        >
          <div className="max-w-2xl mx-auto text-center mb-16">
            <p className="text-sm font-semibold text-brand-primary uppercase tracking-wider mb-3">Capabilities</p>
            <h2 className="font-heading text-3xl sm:text-4xl font-bold text-txt-primary leading-tight">
              Purpose-Built for LGOIMA&nbsp;&mdash;
              <br className="hidden sm:block" />
              Not Generic Compliance Software
            </h2>
            <p className="mt-4 text-txt-secondary text-base leading-relaxed">
              Where generic redaction tools stop at highlighting and removing text, Veil provides
              the complete statutory workflow.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {FEATURES.map((f, i) => (
              <div
                key={f.title}
                className="group relative bg-white border border-border rounded-xl p-6 hover:shadow-lg hover:-translate-y-0.5 transition-all duration-300"
                style={{
                  transitionDelay: feat.visible ? `${i * 70}ms` : "0ms",
                  opacity: feat.visible ? 1 : 0,
                  transform: feat.visible ? "translateY(0)" : "translateY(12px)",
                  transition: "opacity 0.5s ease, transform 0.5s ease, box-shadow 0.3s ease",
                }}
              >
                <div className="absolute left-0 top-6 bottom-6 w-[3px] rounded-full bg-brand-primary/15 group-hover:bg-brand-primary transition-colors duration-300" />
                <div className="pl-3">
                  <div className="w-10 h-10 rounded-lg bg-brand-primary/[0.06] flex items-center justify-center mb-4">
                    <f.Icon className="w-5 h-5 text-brand-primary" />
                  </div>
                  <h3 className="font-heading text-lg font-semibold text-txt-primary mb-2">{f.title}</h3>
                  <p className="text-sm text-txt-secondary leading-relaxed">{f.text}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ============================================================ */}
      {/*  PRODUCT SCREENSHOTS                                          */}
      {/* ============================================================ */}
      <section id="product" className="py-20 lg:py-28" ref={shots.ref}>
        <div
          className={`max-w-7xl mx-auto px-6 transition-all duration-700 ${
            shots.visible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-8"
          }`}
        >
          <div className="max-w-2xl mx-auto text-center mb-16">
            <p className="text-sm font-semibold text-brand-primary uppercase tracking-wider mb-3">Product</p>
            <h2 className="font-heading text-3xl sm:text-4xl font-bold text-txt-primary">
              See Veil in Action
            </h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-8 max-w-5xl mx-auto">
            {SCREENSHOTS.map((s, i) => (
              <div
                key={s.label}
                className="group rounded-xl border border-border bg-white overflow-hidden shadow-sm hover:shadow-xl hover:-translate-y-1 transition-all duration-300"
                style={{
                  transitionDelay: shots.visible ? `${i * 90}ms` : "0ms",
                  opacity: shots.visible ? 1 : 0,
                  transform: shots.visible ? "translateY(0)" : "translateY(16px)",
                  transition: "opacity 0.5s ease, transform 0.5s ease, box-shadow 0.3s ease",
                }}
              >
                <div className="relative aspect-[16/10] overflow-hidden bg-surface-bg">
                  <Image
                    src={s.src}
                    alt={s.alt}
                    fill
                    className="object-cover object-top group-hover:scale-[1.02] transition-transform duration-500"
                    sizes="(max-width: 768px) 100vw, 50vw"
                  />
                </div>
                <div className="px-5 py-4 border-t border-border">
                  <h3 className="text-sm font-semibold text-txt-primary">{s.label}</h3>
                  <p className="text-xs text-txt-secondary mt-0.5">{s.description}</p>
                </div>
              </div>
            ))}
          </div>

          <p className="text-center text-xs text-txt-secondary/50 mt-8">
            Live screenshots from the Veil platform &mdash; veil.datasing.nz
          </p>
        </div>
      </section>

      {/* ============================================================ */}
      {/*  HOW IT WORKS                                                 */}
      {/* ============================================================ */}
      <section id="how-it-works" className="py-20 lg:py-28 bg-surface-bg" ref={steps.ref}>
        <div
          className={`max-w-7xl mx-auto px-6 transition-all duration-700 ${
            steps.visible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-8"
          }`}
        >
          <div className="max-w-2xl mx-auto text-center mb-16">
            <p className="text-sm font-semibold text-brand-primary uppercase tracking-wider mb-3">Workflow</p>
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
                  <div className="relative mx-auto w-[104px] h-[104px] rounded-2xl bg-white border border-border flex items-center justify-center mb-5 shadow-sm">
                    <span className="absolute -top-2.5 -right-2.5 w-7 h-7 rounded-full bg-brand-primary text-white text-xs font-bold flex items-center justify-center shadow-sm">
                      {i + 1}
                    </span>
                    <s.Icon className="w-8 h-8 text-brand-primary" />
                  </div>
                  <h3 className="font-heading text-lg font-semibold text-txt-primary mb-2">{s.title}</h3>
                  <p className="text-sm text-txt-secondary leading-relaxed max-w-[260px] mx-auto">{s.text}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ============================================================ */}
      {/*  BY THE NUMBERS                                               */}
      {/* ============================================================ */}
      <section className="py-20 lg:py-24 bg-white" ref={metrics.ref}>
        <div
          className={`max-w-7xl mx-auto px-6 transition-all duration-700 ${
            metrics.visible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-8"
          }`}
        >
          <div className="max-w-2xl mx-auto text-center mb-14">
            <p className="text-sm font-semibold text-brand-primary uppercase tracking-wider mb-3">Impact</p>
            <h2 className="font-heading text-3xl sm:text-4xl font-bold text-txt-primary">
              By the Numbers
            </h2>
          </div>

          <div className="grid grid-cols-2 lg:grid-cols-4 gap-8 lg:gap-6">
            {METRICS.map((m, i) => (
              <div
                key={m.label}
                className="text-center"
                style={{
                  transitionDelay: metrics.visible ? `${i * 100}ms` : "0ms",
                  opacity: metrics.visible ? 1 : 0,
                  transform: metrics.visible ? "translateY(0) scale(1)" : "translateY(12px) scale(0.97)",
                  transition: "opacity 0.5s ease, transform 0.5s ease",
                }}
              >
                <div className="text-4xl sm:text-5xl font-heading font-bold text-brand-primary leading-none">
                  {m.value}
                </div>
                <p className="mt-2 text-sm text-txt-secondary">{m.label}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ============================================================ */}
      {/*  PULL QUOTE                                                   */}
      {/* ============================================================ */}
      <section className="py-16 lg:py-20" ref={quote.ref}>
        <div
          className={`max-w-4xl mx-auto px-6 transition-all duration-700 ${
            quote.visible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-6"
          }`}
        >
          <div className="relative bg-surface-bg rounded-2xl p-10 sm:p-14 border border-border/60">
            <Quote className="w-10 h-10 text-brand-primary/15 absolute top-8 left-8" aria-hidden="true" />
            <blockquote className="relative">
              <p className="font-heading text-xl sm:text-2xl text-txt-primary leading-relaxed font-medium">
                Veil&apos;s audit trail will withstand Ombudsman investigation. Every action logged.
                Every decision captured. Every ground recorded. Defensibility is not an afterthought&nbsp;&mdash;
                it&apos;s built in.
              </p>
              <footer className="mt-6 flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-brand-primary/10 flex items-center justify-center">
                  <TrendingUp className="w-5 h-5 text-brand-primary" />
                </div>
                <div>
                  <div className="text-sm font-semibold text-txt-primary">Veil Design Principle</div>
                  <div className="text-xs text-txt-secondary">Auditability is not optional</div>
                </div>
              </footer>
            </blockquote>
          </div>
        </div>
      </section>

      {/* ============================================================ */}
      {/*  DATA SOVEREIGNTY & SECURITY                                  */}
      {/* ============================================================ */}
      <section id="security" className="relative py-20 lg:py-28 overflow-hidden" ref={sec.ref}>
        <div
          className="absolute inset-0"
          style={{ background: "linear-gradient(160deg, #1a0940 0%, #3e13af 60%, #2d0e80 100%)" }}
        />
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
          <div className="max-w-2xl mb-16">
            <p className="text-sm font-semibold text-brand-accent uppercase tracking-wider mb-3">Security</p>
            <h2 className="font-heading text-3xl sm:text-4xl font-bold text-white leading-tight">
              Your Data. In New Zealand. Always.
            </h2>
            <p className="mt-4 text-white/60 text-base leading-relaxed">
              All data processed and stored in Azure New Zealand North (Auckland). No data leaves
              NZ under any circumstances. No offshore subprocessors. No exceptions.
            </p>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 lg:gap-16">
            <div>
              <div className="space-y-4 mb-8">
                <div className="flex items-start gap-3 text-white/80">
                  <Check className="w-4 h-4 text-brand-accent mt-1 flex-shrink-0" />
                  <span className="text-sm leading-relaxed">DataSing is Wellington-based. No offshore contractors access your data.</span>
                </div>
                <div className="flex items-start gap-3 text-white/80">
                  <Check className="w-4 h-4 text-brand-accent mt-1 flex-shrink-0" />
                  <span className="text-sm leading-relaxed">Azure NZ North (primary) + Australia East (disaster recovery only).</span>
                </div>
                <div className="flex items-start gap-3 text-white/80">
                  <Check className="w-4 h-4 text-brand-accent mt-1 flex-shrink-0" />
                  <span className="text-sm leading-relaxed">Microsoft confirmed: no customer data used for model training.</span>
                </div>
                <div className="flex items-start gap-3 text-white/80">
                  <Check className="w-4 h-4 text-brand-accent mt-1 flex-shrink-0" />
                  <span className="text-sm leading-relaxed">Annual independent penetration testing. Quarterly AI accuracy reports.</span>
                </div>
              </div>

              <div className="flex flex-wrap gap-2">
                {COMPLIANCE_BADGES.map((badge) => (
                  <span
                    key={badge}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white/[0.06] border border-white/[0.08] text-white/80 text-xs font-medium"
                  >
                    <Check className="w-3 h-3 text-brand-accent" />
                    {badge}
                  </span>
                ))}
              </div>
            </div>

            <div className="space-y-3.5">
              {SECURITY_FEATURES.map((sf) => (
                <div
                  key={sf.text}
                  className="flex items-center gap-3 text-white/75 bg-white/[0.04] rounded-lg px-4 py-3 border border-white/[0.06]"
                >
                  <div className="w-8 h-8 rounded-lg bg-white/[0.06] flex items-center justify-center flex-shrink-0">
                    <sf.Icon className="w-4 h-4 text-white/60" />
                  </div>
                  <span className="text-sm">{sf.text}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ============================================================ */}
      {/*  DEMO REQUEST FORM                                            */}
      {/* ============================================================ */}
      <section id="contact" className="py-20 lg:py-28" ref={cta.ref}>
        <div
          className={`max-w-7xl mx-auto px-6 transition-all duration-700 ${
            cta.visible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-8"
          }`}
        >
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 lg:gap-20 items-start max-w-5xl mx-auto">
            {/* Left — context */}
            <div className="lg:pt-4">
              <p className="text-sm font-semibold text-brand-primary uppercase tracking-wider mb-3">Get Started</p>
              <h2 className="font-heading text-3xl sm:text-4xl font-bold text-txt-primary leading-tight">
                Request a Demo
              </h2>
              <p className="mt-4 text-txt-secondary text-base leading-relaxed">
                See how Veil can transform your LGOIMA disclosure workflow. We&apos;ll walk you through
                the platform with your team and discuss how it maps to your current process.
              </p>

              <div className="mt-8 space-y-4 text-sm text-txt-secondary">
                <div className="flex items-start gap-3">
                  <CheckCircle className="w-4 h-4 text-brand-accent mt-0.5 flex-shrink-0" />
                  <span>Live walkthrough of the full disclosure workflow</span>
                </div>
                <div className="flex items-start gap-3">
                  <CheckCircle className="w-4 h-4 text-brand-accent mt-0.5 flex-shrink-0" />
                  <span>See AI detection on real document types (PDF, email, DOCX)</span>
                </div>
                <div className="flex items-start gap-3">
                  <CheckCircle className="w-4 h-4 text-brand-accent mt-0.5 flex-shrink-0" />
                  <span>Discuss integration with your Azure AD / M365 environment</span>
                </div>
                <div className="flex items-start gap-3">
                  <CheckCircle className="w-4 h-4 text-brand-accent mt-0.5 flex-shrink-0" />
                  <span>No commitment &mdash; no sales pressure</span>
                </div>
              </div>
            </div>

            {/* Right — form */}
            <div>
              {formStatus === "success" ? (
                <div className="bg-white border border-border rounded-xl text-center py-14 px-8 shadow-sm">
                  <div className="w-14 h-14 rounded-full bg-brand-accent/10 flex items-center justify-center mx-auto mb-4">
                    <CheckCircle className="w-7 h-7 text-brand-accent" />
                  </div>
                  <h3 className="font-heading text-xl font-semibold text-txt-primary mb-2">Thank you!</h3>
                  <p className="text-txt-secondary text-sm">We&apos;ll be in touch within 24 hours.</p>
                </div>
              ) : (
                <form
                  onSubmit={handleSubmit}
                  className="bg-white border border-border rounded-xl p-6 sm:p-8 shadow-sm"
                  aria-label="Demo request form"
                >
                  {(formError || formStatus === "error") && (
                    <div role="alert" className="mb-5 p-3 rounded-lg bg-red-50 border border-red-200 text-sm text-red-700">
                      {formError || "Something went wrong. Please try again."}
                    </div>
                  )}

                  <div className="space-y-5">
                    <div>
                      <label htmlFor="demo-name" className="block text-sm font-medium text-txt-primary mb-1.5">
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
                      <label htmlFor="demo-email" className="block text-sm font-medium text-txt-primary mb-1.5">
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
                      <label htmlFor="demo-org" className="block text-sm font-medium text-txt-primary mb-1.5">
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
                      <label htmlFor="demo-message" className="block text-sm font-medium text-txt-primary mb-1.5">
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
                          <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" aria-hidden="true" />
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
        </div>
      </section>

      {/* ============================================================ */}
      {/*  FOOTER                                                       */}
      {/* ============================================================ */}
      <footer className="bg-[#110b1d] text-white/50" role="contentinfo">
        <div className="max-w-7xl mx-auto px-6 py-12">
          <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-8">
            <div className="flex items-center gap-4">
              <Image
                src="/images/Datasing_Logo-02.svg"
                alt="DataSing"
                width={100}
                height={28}
                className="brightness-0 invert opacity-60"
              />
              <span className="text-xs text-white/30">A DataSing Clarivus Product</span>
            </div>

            <div className="flex flex-wrap gap-6 text-xs">
              <button onClick={() => scrollTo("features")} className="hover:text-white/80 transition-colors">
                Features
              </button>
              <button onClick={() => scrollTo("product")} className="hover:text-white/80 transition-colors">
                Product
              </button>
              <button onClick={() => scrollTo("security")} className="hover:text-white/80 transition-colors">
                Security
              </button>
              <button onClick={() => scrollTo("contact")} className="hover:text-white/80 transition-colors">
                Contact
              </button>
              <Link href="/login" className="hover:text-white/80 transition-colors">
                Sign In
              </Link>
            </div>
          </div>

          <div className="mt-8 pt-6 border-t border-white/[0.05] flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-white/25">
            <p>&copy; {new Date().getFullYear()} DataSing Ltd. All rights reserved.</p>
            <p>Veil is part of the Clarivus AI suite.</p>
          </div>
        </div>
      </footer>
    </div>
  );
}
