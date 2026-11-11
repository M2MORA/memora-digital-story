import { describe, expect, it } from "vitest";
import { buildJpegPdf, printSizeCm } from "./print";

const latin1 = (b: Uint8Array) => Array.from(b, (c) => String.fromCharCode(c)).join("");

describe("printSizeCm", () => {
  it("10 × 15 en portrait, 15 × 10 en paysage", () => {
    expect(printSizeCm(1200, 1800)).toEqual({ w: 10, h: 15 });
    expect(printSizeCm(1800, 1200)).toEqual({ w: 15, h: 10 });
  });
});

describe("buildJpegPdf", () => {
  const jpeg = new Uint8Array([0xff, 0xd8, 1, 2, 3, 0xff, 0xd9]);
  const pdf = latin1(buildJpegPdf(jpeg, 1181, 1772, 10, 15));

  it("produit une page de 10 × 15 cm (283,46 × 425,20 points)", () => {
    expect(pdf.startsWith("%PDF-1.4")).toBe(true);
    expect(pdf).toContain("/MediaBox [0 0 283.46 425.20]");
    expect(pdf.trimEnd().endsWith("%%EOF")).toBe(true);
  });

  it("insère le JPEG sans le modifier", () => {
    expect(pdf).toContain("/Width 1181 /Height 1772");
    expect(pdf).toContain("/Filter /DCTDecode /Length 7");
    expect(pdf).toContain(latin1(jpeg));
  });

  it("a une table xref dont chaque position pointe sur son objet", () => {
    const rows = pdf.slice(pdf.indexOf("xref\n")).split("\n").slice(3, 8);
    rows.forEach((row, i) => {
      const offset = Number(row.slice(0, 10));
      expect(pdf.slice(offset, offset + 8)).toBe(`${i + 1} 0 obj\n`);
    });
    const startxref = Number(pdf.match(/startxref\n(\d+)/)![1]);
    expect(pdf.slice(startxref, startxref + 4)).toBe("xref");
  });
});
