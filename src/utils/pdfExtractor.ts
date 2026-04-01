import * as pdfjsLib from 'pdfjs-dist';
import type { TextItem } from 'pdfjs-dist/types/src/display/api';

// Set worker path for pdfjs - use unpkg CDN which is more reliable
pdfjsLib.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjsLib.version}/build/pdf.worker.min.mjs`;

export async function extractTextFromPDF(file: File): Promise<string> {
  try {
    const arrayBuffer = await file.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;

    let fullText = '';

    for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
      const page = await pdf.getPage(pageNum);
      const textContent = await page.getTextContent();

      const items = textContent.items.filter(
        (item): item is TextItem => 'str' in item && item.str.trim() !== ''
      );

      if (items.length === 0) continue;

      // Sort strictly by Y descending (top-to-bottom in visual order).
      // Items with identical (or near-identical) Y are sorted left-to-right by X.
      items.sort((a, b) => {
        const dy = b.transform[5] - a.transform[5];
        if (Math.abs(dy) >= 1) return dy;
        return a.transform[4] - b.transform[4];
      });

      // Cluster items into visual rows.
      // Two items are on the same row when their Y coordinates are within LINE_Y_TOLERANCE.
      // Using the FIRST item's Y as the row anchor handles slight baseline variation.
      const LINE_Y_TOLERANCE = 4; // PDF units; ~0.5pt at 8pt font, safe for same-row chars
      const rows: TextItem[][] = [];
      let currentRow: TextItem[] = [items[0]];
      let rowAnchorY = items[0].transform[5];

      for (let i = 1; i < items.length; i++) {
        const y = items[i].transform[5];
        if (Math.abs(y - rowAnchorY) <= LINE_Y_TOLERANCE) {
          currentRow.push(items[i]);
        } else {
          rows.push(currentRow);
          currentRow = [items[i]];
          rowAnchorY = y;
        }
      }
      rows.push(currentRow);

      // Convert each row to a string.
      // Items are already in left-to-right order (sorted by X above when Y is similar),
      // but re-sort within each row to be safe.
      const pageLines = rows.map(row => {
        row.sort((a, b) => a.transform[4] - b.transform[4]);

        let line = row[0].str;
        for (let i = 1; i < row.length; i++) {
          const prev = row[i - 1];
          const curr = row[i];

          // Font size from the diagonal of the text matrix (transform[3] for unrotated text)
          const fontSize = Math.abs(prev.transform[3]) || Math.abs(prev.transform[0]) || 8;

          // Gap between the right edge of the previous item and the left edge of the current.
          // prev.width is the horizontal advance in PDF user-space units.
          const prevWidth = prev.width > 0 ? prev.width : fontSize * 0.5;
          const gap = curr.transform[4] - (prev.transform[4] + prevWidth);

          // Insert a space when the gap is large enough to represent a word boundary.
          // Word space in most fonts is ~0.25–0.35em; we use 0.25 as a conservative threshold.
          if (gap > fontSize * 0.25) {
            line += ' ' + curr.str;
          } else {
            line += curr.str;
          }
        }
        return line;
      });

      fullText += pageLines.join('\n') + '\n';
    }

    return fullText;
  } catch (error) {
    throw new Error(`Failed to extract text from PDF: ${error instanceof Error ? error.message : String(error)}`);
  }
}
