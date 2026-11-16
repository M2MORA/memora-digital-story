import { describe, expect, it } from "vitest";
import { acceptAttribute, checkBrowserFile, checkFile, FILE_RULES } from "@/lib/file-rules";

const ok = (extension: string, mimeType: string, sizeBytes = 1000) => ({
  extension,
  mimeType,
  sizeBytes,
});

describe("Règles de fichiers partagées (page + route upload-intent)", () => {
  it("vidéo : accepte mp4/mov/webm, tout video/* et application/octet-stream", () => {
    expect(checkFile("video", ok("mp4", "video/mp4"))).toBeNull();
    expect(checkFile("video", ok(".MOV", " Video/QuickTime "))).toBeNull();
    expect(checkFile("video", ok("webm", "video/x-matroska"))).toBeNull();
    expect(checkFile("video", ok("mp4", "application/octet-stream"))).toBeNull();
    expect(checkFile("video", ok("mp4", "video/mp4", FILE_RULES.video.maxBytes))).toBeNull();
  });

  it("vidéo : refuse mauvaise extension, mauvais type, trop gros ou vide", () => {
    expect(checkFile("video", ok("avi", "video/x-msvideo"))).toBe("extension");
    expect(checkFile("video", ok("mp4", "image/jpeg"))).toBe("mime");
    expect(checkFile("video", ok("mp4", "video/mp4", 5368709121))).toBe("size");
    expect(checkFile("video", ok("mp4", "video/mp4", 0))).toBe("empty");
  });

  it("photo : accepte jpg/jpeg/png/webp avec le type exact", () => {
    for (const [ext, mime] of [
      ["jpg", "image/jpeg"],
      ["JPEG", "image/jpeg"],
      ["png", "image/png"],
      ["webp", "image/webp"],
    ] as const) {
      expect(checkFile("photo", ok(ext, mime))).toBeNull();
    }
    expect(checkFile("photo", ok("jpg", "image/jpeg", 26214400))).toBeNull();
  });

  it("photo : refuse heic, gif, octet-stream, plus de 25 Mo ou vide", () => {
    expect(checkFile("photo", ok("heic", "image/heic"))).toBe("extension");
    expect(checkFile("photo", ok("jpg", "image/gif"))).toBe("mime");
    expect(checkFile("photo", ok("jpg", "application/octet-stream"))).toBe("mime");
    expect(checkFile("photo", ok("jpg", "image/jpeg", 26214401))).toBe("size");
    expect(checkFile("photo", ok("png", "image/png", 0))).toBe("empty");
  });

  it("navigateur : sans type, prend le type par défaut qu'enverra le client d'upload", () => {
    expect(checkBrowserFile("video", new File(["x"], "clip.MP4"))).toBeNull();
    expect(checkBrowserFile("photo", new File(["x"], "photo.jpg"))).toBeNull();
    expect(checkBrowserFile("photo", new File(["x"], "photo"))).toBe("extension");
    expect(checkBrowserFile("video", new File([], "clip.mp4", { type: "video/mp4" }))).toBe(
      "empty",
    );
  });

  it("accept : extensions et types, sans octet-stream", () => {
    expect(acceptAttribute("video")).toBe(".mp4,.mov,.webm,video/mp4,video/quicktime,video/webm");
    expect(acceptAttribute("photo")).toBe(".jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp");
  });
});
