import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  _resetBackgroundUploads,
  cancelBackgroundUpload,
  forgetDraftUploads,
  startBackgroundUpload,
} from "@/lib/background-uploads";
import { uploadMediaWithR2Intent } from "@/lib/r2-upload-client";

vi.mock("@/lib/r2-upload-client", () => ({
  uploadMediaWithR2Intent: vi.fn(),
}));

const uploadMock = vi.mocked(uploadMediaWithR2Intent);

function makeFile(name = "clip.mp4", content = "video-bytes", lastModified = 1000): File {
  return new File([content], name, { type: "video/mp4", lastModified });
}

function input(file: File, itemId = "item_1") {
  return { draftId: "dft_1", draftToken: "tok_1", itemId, kind: "video" as const, file };
}

/** Un envoi qui ne se termine que lorsque le test le décide, et réagit à l'annulation. */
function deferredUpload() {
  let resolve: (id: string) => void = () => {};
  uploadMock.mockImplementationOnce(
    ({ signal }) =>
      new Promise<string>((res, rej) => {
        resolve = res;
        signal?.addEventListener("abort", () =>
          rej(Object.assign(new Error("Envoi annulé"), { name: "AbortError" })),
        );
      }),
  );
  return (id: string) => resolve(id);
}

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

describe("Envois de médias en arrière-plan", () => {
  beforeEach(() => {
    uploadMock.mockReset();
    localStorage.clear();
    _resetBackgroundUploads();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("n'envoie qu'une fois un fichier déjà en cours ou déjà prêt", async () => {
    uploadMock.mockResolvedValue("intent_1");
    const file = makeFile();

    const [first, second] = await Promise.all([
      startBackgroundUpload(input(file)),
      startBackgroundUpload(input(file)),
    ]);
    const third = await startBackgroundUpload(input(file));

    expect([first, second, third]).toEqual(["intent_1", "intent_1", "intent_1"]);
    expect(uploadMock).toHaveBeenCalledTimes(1);
  });

  it("remplacer la vidéo annule l'envoi précédent et ne retient que la nouvelle", async () => {
    const finishFirst = deferredUpload();
    uploadMock.mockResolvedValueOnce("intent_new");

    const oldUpload = startBackgroundUpload(input(makeFile("old.mp4")));
    await flush();
    const newUpload = startBackgroundUpload(input(makeFile("new.mp4")));

    await expect(oldUpload).rejects.toMatchObject({ name: "AbortError" });
    await expect(newUpload).resolves.toBe("intent_new");

    finishFirst("intent_old");
    await expect(startBackgroundUpload(input(makeFile("new.mp4")))).resolves.toBe("intent_new");
    expect(uploadMock).toHaveBeenCalledTimes(2);
  });

  it("retrouve un fichier prêt après rechargement de la page", async () => {
    uploadMock.mockResolvedValue("intent_saved");
    const file = makeFile();
    await startBackgroundUpload(input(file));

    // Simule un rechargement : la mémoire est perdue, localStorage reste
    _resetBackgroundUploads();

    await expect(startBackgroundUpload(input(file))).resolves.toBe("intent_saved");
    expect(uploadMock).toHaveBeenCalledTimes(1);
  });

  it("réessaie automatiquement après une erreur réseau", async () => {
    vi.useFakeTimers();
    uploadMock.mockRejectedValueOnce(new Error("réseau")).mockResolvedValueOnce("intent_retry");

    const upload = startBackgroundUpload(input(makeFile()));
    await vi.advanceTimersByTimeAsync(1000);

    await expect(upload).resolves.toBe("intent_retry");
    expect(uploadMock).toHaveBeenCalledTimes(2);
  });

  it("après échec définitif, une nouvelle tentative relance seulement ce fichier", async () => {
    vi.useFakeTimers();
    uploadMock.mockRejectedValue(new Error("réseau"));
    const file = makeFile();

    const failed = startBackgroundUpload(input(file));
    const assertion = expect(failed).rejects.toThrow("réseau");
    await vi.advanceTimersByTimeAsync(4000);
    await assertion;
    expect(uploadMock).toHaveBeenCalledTimes(3);

    uploadMock.mockReset();
    uploadMock.mockResolvedValue("intent_after_failure");
    await expect(startBackgroundUpload(input(file))).resolves.toBe("intent_after_failure");
  });

  it("supprimer un article arrête son envoi et l'oublie", async () => {
    deferredUpload();
    const upload = startBackgroundUpload(input(makeFile()));
    await flush();

    cancelBackgroundUpload("dft_1", "item_1");
    await expect(upload).rejects.toMatchObject({ name: "AbortError" });

    uploadMock.mockResolvedValue("intent_again");
    await expect(startBackgroundUpload(input(makeFile()))).resolves.toBe("intent_again");
  });

  it("forgetDraftUploads force un nouvel envoi (fichiers expirés)", async () => {
    uploadMock.mockResolvedValueOnce("intent_old").mockResolvedValueOnce("intent_fresh");
    const file = makeFile();

    await startBackgroundUpload(input(file));
    forgetDraftUploads("dft_1");

    await expect(startBackgroundUpload(input(file))).resolves.toBe("intent_fresh");
    expect(localStorage.getItem("memora_background_uploads_v1")).toContain("intent_fresh");
  });

  it("limite à deux envois simultanés", async () => {
    const finishers = [deferredUpload(), deferredUpload(), deferredUpload()];

    const uploads = ["a", "b", "c"].map((item) =>
      startBackgroundUpload(input(makeFile(`${item}.mp4`), item)),
    );
    await flush();
    expect(uploadMock).toHaveBeenCalledTimes(2);

    finishers[0]?.("id_a");
    await flush();
    expect(uploadMock).toHaveBeenCalledTimes(3);

    finishers[1]?.("id_b");
    finishers[2]?.("id_c");
    await expect(Promise.all(uploads)).resolves.toEqual(["id_a", "id_b", "id_c"]);
  });
});
