export interface BBox {
  posX: number;
  posY: number;
  posW: number;
  posH: number;
}

export interface WordLayout {
  text: string;
  confidence: number;
  polygon?: number[];
}

export function calculateBBoxAll(
  detectionText: string,
  words: WordLayout[],
  pageWidth?: number,
  pageHeight?: number,
): BBox[] {
  const empty: BBox[] = [];
  if (!words || words.length === 0 || !detectionText) return empty;

  const target = detectionText.toLowerCase().replace(/\s+/g, " ").trim();
  if (!target || target.length > 80) return empty;

  const targetWords = target.split(/\s+/);
  const results: BBox[] = [];

  for (let start = 0; start < words.length; start++) {
    let concat = "";
    for (let end = start; end < words.length && end < start + 50; end++) {
      if (end > start) concat += " ";
      concat += words[end].text;

      const normalized = concat.toLowerCase().replace(/\s+/g, " ");
      if (normalized.includes(target)) {
        const withoutFirst = concat.substring(words[start].text.length).toLowerCase().replace(/\s+/g, " ");
        if (!withoutFirst.includes(target)) {
          results.push(...computeBoxesFromWords(words.slice(start, end + 1), pageWidth, pageHeight));
          start = end; // Skip forward to avoid overlapping matches of the same instance
        }
        break;
      }
    }
  }

  if (results.length === 0 && targetWords.length === 1) {
    const matches = words.filter(w => w.text.toLowerCase() === target);
    for (const match of matches) {
      results.push(...computeBoxesFromWords([match], pageWidth, pageHeight));
    }
  }

  if (results.length === 0) return empty;

  const uniqueBoxes: BBox[] = [];
  for (const box of results) {
    if (box.posW === 0 && box.posH === 0) continue;
    const isDuplicate = uniqueBoxes.some(u => 
      Math.abs(u.posX - box.posX) < 0.1 &&
      Math.abs(u.posY - box.posY) < 0.1 &&
      Math.abs(u.posW - box.posW) < 0.1 &&
      Math.abs(u.posH - box.posH) < 0.1
    );
    if (!isDuplicate) {
      uniqueBoxes.push(box);
    }
  }
  
  if (uniqueBoxes.length === 0) {
      return [{ posX: 0, posY: 0, posW: 0, posH: 0 }];
  }

  return uniqueBoxes;
}

function computeBoxesFromWords(
  matchedWords: WordLayout[],
  pageWidth?: number,
  pageHeight?: number,
): BBox[] {
  const lines: WordLayout[][] = [];
  const yTolerance = pageWidth && pageHeight ? pageHeight * 0.015 : 15;

  for (const word of matchedWords) {
    if (!word.polygon || word.polygon.length < 8) continue;
    let minY = Infinity, maxY = -Infinity;
    for (let i = 1; i < word.polygon.length; i += 2) {
      const y = word.polygon[i];
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
    const centerY = (minY + maxY) / 2;

    let addedToLine = false;
    for (const line of lines) {
      const firstWord = line[0];
      let firstMinY = Infinity, firstMaxY = -Infinity;
      for (let i = 1; i < firstWord.polygon!.length; i += 2) {
        const y = firstWord.polygon![i];
        if (y < firstMinY) firstMinY = y;
        if (y > firstMaxY) firstMaxY = y;
      }
      const firstCenterY = (firstMinY + firstMaxY) / 2;
      
      if (Math.abs(centerY - firstCenterY) < yTolerance) {
        line.push(word);
        addedToLine = true;
        break;
      }
    }
    if (!addedToLine) {
      lines.push([word]);
    }
  }

  const boxes: BBox[] = [];
  for (const line of lines) {
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const word of line) {
      for (let i = 0; i < word.polygon!.length; i += 2) {
        const x = word.polygon![i];
        const y = word.polygon![i + 1];
        if (x < minX) minX = x;
        if (y < minY) minY = y;
        if (x > maxX) maxX = x;
        if (y > maxY) maxY = y;
      }
    }

    if (minX !== Infinity) {
      if (pageWidth && pageHeight && pageWidth > 0 && pageHeight > 0) {
        boxes.push({
          posX: Math.round((minX / pageWidth) * 100 * 100) / 100,
          posY: Math.round((minY / pageHeight) * 100 * 100) / 100,
          posW: Math.round(((maxX - minX) / pageWidth) * 100 * 100) / 100,
          posH: Math.round(((maxY - minY) / pageHeight) * 100 * 100) / 100,
        });
      } else {
        boxes.push({
          posX: Math.round(minX * 100) / 100,
          posY: Math.round(minY * 100) / 100,
          posW: Math.round((maxX - minX) * 100) / 100,
          posH: Math.round((maxY - minY) * 100) / 100,
        });
      }
    }
  }

  return boxes;
}
