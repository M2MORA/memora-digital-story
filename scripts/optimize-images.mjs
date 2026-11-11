/**
 * Génère les versions légères des photos du site (WebP en 3 largeurs + aperçu
 * flou) et l'image de partage (og:image). Résultat commité : rien ne tourne au
 * build, et sharp n'est pas une dépendance du projet.
 *
 * Relancer après avoir ajouté ou modifié une photo :
 *   npm i --no-save sharp && node scripts/optimize-images.mjs
 */
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import sharp from "sharp";

const ASSETS = "src/assets";
const OUT = join(ASSETS, "optimized");
const WIDTHS = [480, 960, 1600];
const QUALITY = 72;

/** clé dans IMAGES → fichier source dans src/assets */
const SOURCES = {
  hero: "hero-v2.jpg",
  tap: "scan-v2.jpg",
  generations: "lifestyle-emotion-v2.jpg",
  moments: "product-moments-v2.jpg",
  envelope: "product-envelope-v2.jpg",
  family: "recto-family-v2.jpg",
};

await mkdir(OUT, { recursive: true });

const imports = [];
const entries = [];

for (const [key, file] of Object.entries(SOURCES)) {
  const input = join(ASSETS, file);
  const base = file.replace(/\.jpg$/, "");
  const { width, height } = await sharp(input).metadata();

  const sizes = [...new Set(WIDTHS.map((w) => Math.min(w, width)))];
  const srcSetParts = [];
  for (const w of sizes) {
    const name = `${base}-${w}.webp`;
    await sharp(input).resize({ width: w }).webp({ quality: QUALITY }).toFile(join(OUT, name));
    const id = `${key}${w}`;
    imports.push(`import ${id} from "@/assets/optimized/${name}";`);
    srcSetParts.push(`\`\${${id}} ${w}w\``);
  }

  // Aperçu flou (≈ 1 Ko) affiché tant que la vraie photo n'est pas arrivée
  const tiny = await sharp(input).resize({ width: 24 }).webp({ quality: 50 }).toBuffer();
  const placeholder = `data:image/webp;base64,${tiny.toString("base64")}`;

  imports.push(`import ${key}Jpg from "@/assets/${file}";`);
  entries.push(
    `  ${key}: {\n` +
      `    src: ${key}Jpg,\n` +
      `    srcSet: [${srcSetParts.join(", ")}].join(", "),\n` +
      `    width: ${width},\n` +
      `    height: ${height},\n` +
      `    placeholder: "${placeholder}",\n` +
      `  },`,
  );
  console.log(`${file}: ${sizes.join(", ")} px`);
}

const ts = `// Fichier généré par scripts/optimize-images.mjs — ne pas modifier à la main.
${imports.join("\n")}

export type OptimizedImage = {
  /** JPG d'origine, pour les navigateurs sans WebP */
  src: string;
  /** Versions WebP, à donner à <source srcSet> */
  srcSet: string;
  width: number;
  height: number;
  /** Mini-aperçu flou en base64 */
  placeholder: string;
};

export const IMAGES = {
${entries.join("\n")}
} satisfies Record<string, OptimizedImage>;
`;
await writeFile("src/lib/images.gen.ts", ts);

// Image de partage 1200 × 630 (WhatsApp, Facebook…)
await mkdir("public/og", { recursive: true });
await sharp(join(ASSETS, "hero-v2.jpg"))
  .resize({ width: 1200, height: 630, fit: "cover", position: "centre" })
  .jpeg({ quality: 82, mozjpeg: true })
  .toFile("public/og/memora.jpg");
console.log("public/og/memora.jpg: 1200 x 630");
