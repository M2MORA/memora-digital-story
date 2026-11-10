import { describe, expect, it } from "vitest";
import { resolveMemoryMediaSrc } from "@/lib/memory-video";

const key = "staging/dft_1/11111111-2222-3333-4444-555555555555.mp4";
const encoded = encodeURIComponent(key);

describe("resolveMemoryMediaSrc", () => {
  it("ignore l'origine localhost enregistrée par l'admin", () => {
    expect(resolveMemoryMediaSrc(`http://localhost:8080/api/media?key=${encoded}`)).toBe(
      `/api/media?key=${encoded}`,
    );
  });

  it("ramène toute origine vers le site courant", () => {
    expect(resolveMemoryMediaSrc(`https://memora.tn/api/media?key=${encoded}`)).toBe(
      `/api/media?key=${encoded}`,
    );
  });

  it("transforme une clé R2 nue en adresse /api/media", () => {
    expect(resolveMemoryMediaSrc(key)).toBe(`/api/media?key=${encoded}`);
  });

  it("laisse intactes les adresses relatives et les vidéos externes", () => {
    expect(resolveMemoryMediaSrc("/assets/demo.mp4")).toBe("/assets/demo.mp4");
    expect(resolveMemoryMediaSrc("https://cdn.example.com/video.mp4")).toBe(
      "https://cdn.example.com/video.mp4",
    );
  });
});
