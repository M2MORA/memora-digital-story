/**
 * MÉMORA — Calcul d'Empreinte SHA-256 Sécurisé et Streaming (Phase 1.1)
 *
 * Résout les limites CPU & Mémoire réelles :
 * - NE CHARGE PAS l'intégralité d'une vidéo (50 Mo - 5 Go) en mémoire RAM.
 * - Traite le fichier par morceaux progressifs (chunks de 2 Mo).
 * - Implémentation incrémentale progressive FIPS 180-4 sans débordement de mémoire.
 * - Validation stricte du nombre d'octets traités vs taille attendue.
 * - Support de l'annulation coopérative via AbortSignal.
 *
 * NOTE D'ARCHITECTURE CLOUDFLARE R2 & WORKER :
 * - Le moteur pur JavaScript ci-dessous est conçu pour le navigateur client (déporté dans un Web Worker).
 * - Sur un Cloudflare Worker (limite CPU stricte de 50 ms en plan gratuit / standard),
 *   ce moteur pur JS NE DOIT PAS être exécuté sur des vidéos lourdes (> 10 Mo).
 * - L'intégrité R2 doit s'appuyer sur la validation native S3 (en-tête `x-amz-checksum-sha256`)
 *   ou sur l'API native `crypto.subtle.digest` par chunking.
 * - Les ETags multipart S3 (`<hash>-<parts>`) sont basés sur MD5 et NE CONSTITUENT PAS un SHA-256.
 */

export class Sha256SizeMismatchError extends Error {
  constructor(expected: number, actual: number) {
    super(`Taille de fichier incohérente : ${actual} octets traités, ${expected} attendus.`);
    this.name = "Sha256SizeMismatchError";
  }
}

export class Sha256AbortedError extends Error {
  constructor() {
    super("Calcul SHA-256 interrompu par AbortSignal.");
    this.name = "Sha256AbortedError";
  }
}

// Constantes SHA-256 (FIPS 180-4)
const K = new Uint32Array([
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
  0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
]);

function rotr(n: number, x: number): number {
  return (x >>> n) | (x << (32 - n));
}

function ch(x: number, y: number, z: number): number {
  return (x & y) ^ (~x & z);
}

function maj(x: number, y: number, z: number): number {
  return (x & y) ^ (x & z) ^ (y & z);
}

function sigma0(x: number): number {
  return rotr(2, x) ^ rotr(13, x) ^ rotr(22, x);
}

function sigma1(x: number): number {
  return rotr(6, x) ^ rotr(11, x) ^ rotr(25, x);
}

function gamma0(x: number): number {
  return rotr(7, x) ^ rotr(18, x) ^ (x >>> 3);
}

function gamma1(x: number): number {
  return rotr(17, x) ^ rotr(19, x) ^ (x >>> 10);
}

export class ProgressiveSha256 {
  private h0 = 0x6a09e667;
  private h1 = 0xbb67ae85;
  private h2 = 0x3c6ef372;
  private h3 = 0xa54ff53a;
  private h4 = 0x510e527f;
  private h5 = 0x9b05688c;
  private h6 = 0x1f83d9ab;
  private h7 = 0x5be0cd19;

  private buffer = new Uint8Array(64);
  private bufferLength = 0;
  private bytesProcessed = 0;
  private w = new Uint32Array(64);

  get totalBytesProcessed(): number {
    return this.bytesProcessed;
  }

  update(data: Uint8Array): this {
    let offset = 0;
    const len = data.length;
    this.bytesProcessed += len;

    while (offset < len) {
      const needed = 64 - this.bufferLength;
      const toCopy = Math.min(needed, len - offset);
      this.buffer.set(data.subarray(offset, offset + toCopy), this.bufferLength);
      this.bufferLength += toCopy;
      offset += toCopy;

      if (this.bufferLength === 64) {
        this.processBlock(this.buffer);
        this.bufferLength = 0;
      }
    }

    return this;
  }

  private processBlock(block: Uint8Array): void {
    const w = this.w;
    const view = new DataView(block.buffer, block.byteOffset, 64);

    for (let i = 0; i < 16; i++) {
      w[i] = view.getUint32(i * 4, false);
    }
    for (let i = 16; i < 64; i++) {
      const s0 = gamma0(w[i - 15]!);
      const s1 = gamma1(w[i - 2]!);
      w[i] = (w[i - 16]! + s0 + w[i - 7]! + s1) | 0;
    }

    let a = this.h0;
    let b = this.h1;
    let c = this.h2;
    let d = this.h3;
    let e = this.h4;
    let f = this.h5;
    let g = this.h6;
    let h = this.h7;

    for (let i = 0; i < 64; i++) {
      const t1 = (h + sigma1(e) + ch(e, f, g) + K[i]! + w[i]!) | 0;
      const t2 = (sigma0(a) + maj(a, b, c)) | 0;
      h = g;
      g = f;
      f = e;
      e = (d + t1) | 0;
      d = c;
      c = b;
      b = a;
      a = (t1 + t2) | 0;
    }

    this.h0 = (this.h0 + a) | 0;
    this.h1 = (this.h1 + b) | 0;
    this.h2 = (this.h2 + c) | 0;
    this.h3 = (this.h3 + d) | 0;
    this.h4 = (this.h4 + e) | 0;
    this.h5 = (this.h5 + f) | 0;
    this.h6 = (this.h6 + g) | 0;
    this.h7 = (this.h7 + h) | 0;
  }

  digestHex(): string {
    const totalBits = this.bytesProcessed * 8;

    // Ajouter le bit 1 (0x80)
    this.buffer[this.bufferLength++] = 0x80;

    // Si la place restante ne suffit pas pour la taille (8 octets, donc besoin de <= 56)
    if (this.bufferLength > 56) {
      this.buffer.fill(0, this.bufferLength);
      this.processBlock(this.buffer);
      this.bufferLength = 0;
    }

    // Remplir de zéros jusqu'au 56e octet
    this.buffer.fill(0, this.bufferLength, 56);

    // Écrire les 64 bits de longueur totale (big-endian)
    const view = new DataView(this.buffer.buffer, this.buffer.byteOffset, 64);
    const high = Math.floor(totalBits / 0x100000000);
    const low = totalBits >>> 0;
    view.setUint32(56, high, false);
    view.setUint32(60, low, false);

    this.processBlock(this.buffer);

    const out = [this.h0, this.h1, this.h2, this.h3, this.h4, this.h5, this.h6, this.h7];
    return out
      .map((val) => (val >>> 0).toString(16).padStart(8, "0"))
      .join("");
  }
}

export interface StreamingSha256Options {
  chunkSize?: number;
  expectedSizeBytes?: number;
  signal?: AbortSignal;
  onProgress?: (progress0To1: number) => void;
}

function readBlobAsArrayBuffer(blob: Blob): Promise<ArrayBuffer> {
  if (typeof blob.arrayBuffer === "function") {
    return blob.arrayBuffer();
  }
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as ArrayBuffer);
    reader.onerror = () => reject(reader.error);
    reader.readAsArrayBuffer(blob);
  });
}

/**
 * Calcule l'empreinte SHA-256 d'un Blob/File de manière streaming, par morceaux constants (2 Mo par défaut).
 * Mémoire constante (< 4 Mo) quel que soit le volume du fichier.
 * Vérifie l'intégrité de la taille finale et supporte l'annulation coopérative via AbortSignal.
 */
export async function computeStreamingSha256(
  file: Blob,
  options: StreamingSha256Options = {}
): Promise<string> {
  const {
    chunkSize = 2 * 1024 * 1024,
    expectedSizeBytes,
    signal,
    onProgress,
  } = options;

  if (signal?.aborted) {
    throw new Sha256AbortedError();
  }

  const hasher = new ProgressiveSha256();
  const total = file.size;

  if (expectedSizeBytes !== undefined && total !== expectedSizeBytes) {
    throw new Sha256SizeMismatchError(expectedSizeBytes, total);
  }

  let offset = 0;

  while (offset < total) {
    if (signal?.aborted) {
      throw new Sha256AbortedError();
    }

    const slice = file.slice(offset, Math.min(offset + chunkSize, total));
    const buffer = await readBlobAsArrayBuffer(slice);

    hasher.update(new Uint8Array(buffer));
    offset += buffer.byteLength;

    if (onProgress && total > 0) {
      onProgress(Math.min(offset / total, 1));
    }
  }

  if (expectedSizeBytes !== undefined && hasher.totalBytesProcessed !== expectedSizeBytes) {
    throw new Sha256SizeMismatchError(expectedSizeBytes, hasher.totalBytesProcessed);
  }

  return hasher.digestHex();
}
