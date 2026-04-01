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

      // Filter non-empty text items and sort in natural reading order:
      // top-to-bottom (Y descending in PDF coords), left-to-right (X ascending)
      // Items within 3 units of the same Y are treated as the same row.
      const items = textContent.items
        .filter((item): item is TextItem => 'str' in item && item.str.trim() !== '')
        .sort((a, b) => {
          const yA = a.transform[5];
          const yB = b.transform[5];
          if (Math.abs(yA - yB) > 3) return yB - yA; // different rows: top first
          return a.transform[4] - b.transform[4];     // same row: left first
        });

      const pageText = items.map(item => item.str).join('\n');
      fullText += pageText + '\n';
    }

    return fullText;
  } catch (error) {
    throw new Error(`Failed to extract text from PDF: ${error instanceof Error ? error.message : String(error)}`);
  }
}
