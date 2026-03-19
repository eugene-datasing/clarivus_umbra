/**
 * Metadata Sanitisation — WP15
 *
 * Strips metadata from DOCX and XLSX files before including them
 * in export packages. PDF metadata is already handled by the
 * redacted PDF builder. This handles Office Open XML formats.
 *
 * DOCX/XLSX files are ZIP archives containing XML files.
 * Metadata lives in docProps/core.xml and docProps/app.xml.
 * We remove these entries to strip author, revision, title,
 * and other identifying metadata.
 */

import JSZip from "jszip";

const METADATA_ENTRIES = [
  "docProps/core.xml",
  "docProps/app.xml",
  "docProps/custom.xml",
  "_rels/.rels", // needs patching, not removal
];

const METADATA_REMOVABLE = [
  "docProps/core.xml",
  "docProps/app.xml",
  "docProps/custom.xml",
];

/**
 * Strip metadata from DOCX or XLSX file.
 * Returns the sanitised buffer, or the original if the format
 * is not a supported Office Open XML file.
 */
export async function sanitiseMetadata(
  buffer: Buffer,
  fileType: string,
): Promise<Buffer> {
  const ft = fileType.toLowerCase();
  if (ft !== "docx" && ft !== "xlsx" && ft !== "pptx") {
    // Not an Office Open XML format — return as-is
    return buffer;
  }

  try {
    const zip = await JSZip.loadAsync(buffer);

    // Check if this is actually a valid OOXML file
    if (!zip.file("[Content_Types].xml")) {
      return buffer;
    }

    let modified = false;

    // Remove metadata XML files
    for (const entry of METADATA_REMOVABLE) {
      if (zip.file(entry)) {
        zip.remove(entry);
        modified = true;
      }
    }

    // Patch _rels/.rels to remove references to removed docProps files
    const relsFile = zip.file("_rels/.rels");
    if (relsFile && modified) {
      let relsContent = await relsFile.async("string");
      // Remove Relationship elements pointing to docProps/*
      relsContent = relsContent.replace(
        /<Relationship[^>]*Target="docProps\/[^"]*"[^>]*\/>/g,
        "",
      );
      zip.file("_rels/.rels", relsContent);
    }

    // Patch [Content_Types].xml to remove references to docProps
    const contentTypesFile = zip.file("[Content_Types].xml");
    if (contentTypesFile && modified) {
      let ctContent = await contentTypesFile.async("string");
      ctContent = ctContent.replace(
        /<Override[^>]*PartName="\/docProps\/[^"]*"[^>]*\/>/g,
        "",
      );
      zip.file("[Content_Types].xml", ctContent);
    }

    if (!modified) {
      return buffer;
    }

    const result = await zip.generateAsync({
      type: "nodebuffer",
      compression: "DEFLATE",
    });

    return result;
  } catch (err) {
    console.warn(`[sanitise] Failed to sanitise ${fileType} metadata:`, err);
    // Return original on failure — better to include unsanitised than to fail
    return buffer;
  }
}
