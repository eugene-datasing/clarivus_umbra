/**
 * Mappers to translate between DB values and frontend display values.
 * The DB stores plain strings (e.g. "in-review"), matching the frontend directly.
 * These helpers provide type-safe config lookups.
 */

// --- Request / Case status ---
export type RequestStatus = "draft" | "ingesting" | "in-review" | "senior-review" | "final-approval" | "qa" | "ready-export" | "released";

export const statusConfig: Record<RequestStatus, { label: string; color: string; bg: string }> = {
  draft: { label: "Draft", color: "text-gray-600", bg: "bg-gray-100" },
  ingesting: { label: "Ingesting", color: "text-blue-700", bg: "bg-blue-50" },
  "in-review": { label: "In Review", color: "text-blue-700", bg: "bg-blue-50" },
  "senior-review": { label: "Senior Review", color: "text-amber-700", bg: "bg-amber-50" },
  "final-approval": { label: "Final Approval", color: "text-amber-700", bg: "bg-amber-50" },
  qa: { label: "QA", color: "text-purple-700", bg: "bg-purple-50" },
  "ready-export": { label: "Ready for Export", color: "text-green-700", bg: "bg-green-50" },
  released: { label: "Released", color: "text-brand-primary", bg: "bg-purple-50" },
};

// --- Document status ---
export type DocStatus = "pending" | "processing" | "ready" | "in-review" | "reviewed" | "signed-off" | "submitted" | "approved" | "rejected" | "released" | "error";

export const docStatusConfig: Record<DocStatus, { label: string; color: string; bg: string }> = {
  pending: { label: "Pending", color: "text-gray-600", bg: "bg-gray-100" },
  processing: { label: "Processing", color: "text-blue-600", bg: "bg-blue-50" },
  ready: { label: "Ready for Review", color: "text-amber-600", bg: "bg-amber-50" },
  "in-review": { label: "In Review", color: "text-blue-600", bg: "bg-blue-50" },
  reviewed: { label: "Reviewed (Initial)", color: "text-purple-600", bg: "bg-purple-50" },
  "signed-off": { label: "Signed Off", color: "text-green-600", bg: "bg-green-50" },
  submitted: { label: "Submitted", color: "text-amber-600", bg: "bg-amber-50" },
  approved: { label: "Approved", color: "text-green-600", bg: "bg-green-50" },
  rejected: { label: "Rejected", color: "text-red-600", bg: "bg-red-50" },
  released: { label: "Released", color: "text-brand-primary", bg: "bg-purple-50" },
  error: { label: "Error", color: "text-red-600", bg: "bg-red-50" },
};

// --- Document type ---
export type DocType = "pdf" | "docx" | "xlsx" | "pptx" | "eml" | "msg" | "txt" | "img";

export const docTypeConfig: Record<DocType, { label: string; color: string; icon: string }> = {
  pdf: { label: "PDF", color: "text-red-600 bg-red-50", icon: "FileText" },
  docx: { label: "DOCX", color: "text-blue-600 bg-blue-50", icon: "FileText" },
  xlsx: { label: "XLSX", color: "text-green-600 bg-green-50", icon: "FileSpreadsheet" },
  pptx: { label: "PPTX", color: "text-orange-600 bg-orange-50", icon: "Presentation" },
  eml: { label: "EML", color: "text-blue-600 bg-blue-50", icon: "Mail" },
  msg: { label: "MSG", color: "text-blue-600 bg-blue-50", icon: "Mail" },
  txt: { label: "TXT", color: "text-gray-600 bg-gray-50", icon: "FileText" },
  img: { label: "IMG", color: "text-purple-600 bg-purple-50", icon: "Image" },
};

// --- Detection type ---
export type DetectionType = "personal-name" | "phone" | "email-addr" | "ird" | "address" | "bank-account" | "nz-passport" | "vehicle-reg" | "nhi" | "commercial" | "free-frank" | "legal-privilege" | "confidential" | "negotiation" | "safety-concern" | "law-enforcement" | "council-commercial" | "harassment-risk" | "cultural-sensitivity" | "health-safety" | "manual" | "custom-keyword" | "custom-pattern" | "custom-entity" | "custom-combination";
export type DetectionStatus = "pending" | "accepted" | "rejected" | "modified";

export const detectionTypeConfig: Record<DetectionType, { label: string; color: string }> = {
  "personal-name": { label: "Personal Name", color: "bg-blue-100 text-blue-700" },
  phone: { label: "Phone Number", color: "bg-blue-100 text-blue-700" },
  "email-addr": { label: "Email Address", color: "bg-blue-100 text-blue-700" },
  ird: { label: "IRD Number", color: "bg-red-100 text-red-700" },
  address: { label: "Address", color: "bg-blue-100 text-blue-700" },
  "bank-account": { label: "Bank Account", color: "bg-red-100 text-red-700" },
  "nz-passport": { label: "Passport Number", color: "bg-red-100 text-red-700" },
  "vehicle-reg": { label: "Vehicle Registration", color: "bg-blue-100 text-blue-700" },
  nhi: { label: "NHI Number", color: "bg-red-100 text-red-700" },
  commercial: { label: "Commercial", color: "bg-amber-100 text-amber-700" },
  "free-frank": { label: "Free & Frank", color: "bg-purple-100 text-purple-700" },
  "legal-privilege": { label: "Legal Privilege", color: "bg-orange-100 text-orange-700" },
  confidential: { label: "Confidential", color: "bg-pink-100 text-pink-700" },
  negotiation: { label: "Negotiation Position", color: "bg-amber-100 text-amber-700" },
  "safety-concern": { label: "Safety Concern", color: "bg-red-100 text-red-700" },
  "law-enforcement": { label: "Law Enforcement", color: "bg-red-100 text-red-700" },
  "council-commercial": { label: "Council Commercial", color: "bg-amber-100 text-amber-700" },
  "harassment-risk": { label: "Harassment Risk", color: "bg-orange-100 text-orange-700" },
  "cultural-sensitivity": { label: "Cultural Sensitivity", color: "bg-purple-100 text-purple-700" },
  "health-safety": { label: "Health & Safety", color: "bg-red-100 text-red-700" },
  manual: { label: "Manual", color: "bg-gray-100 text-gray-700" },
  "custom-keyword": { label: "Custom Keyword", color: "bg-teal-100 text-teal-700" },
  "custom-pattern": { label: "Custom Pattern", color: "bg-teal-100 text-teal-700" },
  "custom-entity": { label: "Custom Entity", color: "bg-teal-100 text-teal-700" },
  "custom-combination": { label: "Custom Rule", color: "bg-teal-100 text-teal-700" },
};

// --- Document content types (for review page) ---
export interface DocSegment {
  text: string;
  detectionId?: string;
}

export interface DocParagraph {
  heading?: string;
  page?: number;
  segments: DocSegment[];
}
