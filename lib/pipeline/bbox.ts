/**
 * Calculate bounding box for a detection by matching its text against
 * the word-level layout data from Azure Document Intelligence.
 */

interface WordLayout {
  text: string;
  confidence: number;
  polygon?: number[];
}

interface BBox {
  posX: number;
  posY: number;
  posW: number;
  posH: number;
}

/**
 * Given a detection's text and page number, find the matching words in
 * the layout data and compute a bounding box that encompasses them all.
 *
 * Words are matched by finding a consecutive sequence whose concatenated
 * text contains the detection text (case-insensitive substring match).
 *
 * Returns {posX: 0, posY: 0, posW: 0, posH: 0} if no match is found
 * (e.g., for DOCX/XLSX where no layout data exists).
 */
export function calculateBBox(
  detectionText: string,
  words: WordLayout[],
  pageWidth?: number,
  pageHeight?: number,
): BBox {
  const empty: BBox = { posX: 0, posY: 0, posW: 0, posH: 0 };
  if (!words || words.length === 0 || !detectionText) return empty;

  const target = detectionText.toLowerCase().replace(/\s+/g, " ").trim();
  if (!target) return empty;

  // Try sliding window over words to find a consecutive sequence matching the target
  for (let start = 0; start < words.length; start++) {
    let concat = "";
    for (let end = start; end < words.length && end < start + 50; end++) {
      if (end > start) concat += " ";
      concat += words[end].text;

      const normalized = concat.toLowerCase().replace(/\s+/g, " ");
      if (normalized.includes(target)) {
        // Found matching window [start..end]
        return computeBoxFromWords(words.slice(start, end + 1), pageWidth, pageHeight);
      }
    }
  }

  // Fallback: try matching individual words for single-word detections
  const targetWords = target.split(/\s+/);
  if (targetWords.length === 1) {
    const match = words.find(w => w.text.toLowerCase() === target);
    if (match) return computeBoxFromWords([match], pageWidth, pageHeight);
  }

  return empty;
}

function computeBoxFromWords(
  matchedWords: WordLayout[],
  pageWidth?: number,
  pageHeight?: number,
): BBox {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;

  for (const word of matchedWords) {
    if (!word.polygon || word.polygon.length < 8) continue;
    // Polygon: [x1,y1, x2,y2, x3,y3, x4,y4] (4 corners)
    for (let i = 0; i < word.polygon.length; i += 2) {
      const x = word.polygon[i];
      const y = word.polygon[i + 1];
      if (x < minX) minX = x;
      if (y < minY) minY = y;
      if (x > maxX) maxX = x;
      if (y > maxY) maxY = y;
    }
  }

  if (minX === Infinity) return { posX: 0, posY: 0, posW: 0, posH: 0 };

  // Normalize to 0-1 range if page dimensions are available
  if (pageWidth && pageHeight && pageWidth > 0 && pageHeight > 0) {
    return {
      posX: Math.round((minX / pageWidth) * 10000) / 10000,
      posY: Math.round((minY / pageHeight) * 10000) / 10000,
      posW: Math.round(((maxX - minX) / pageWidth) * 10000) / 10000,
      posH: Math.round(((maxY - minY) / pageHeight) * 10000) / 10000,
    };
  }

  // Return raw coordinates if no page dimensions
  return {
    posX: Math.round(minX * 100) / 100,
    posY: Math.round(minY * 100) / 100,
    posW: Math.round((maxX - minX) * 100) / 100,
    posH: Math.round((maxY - minY) * 100) / 100,
  };
}
