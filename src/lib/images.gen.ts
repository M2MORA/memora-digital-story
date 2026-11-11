// Fichier généré par scripts/optimize-images.mjs — ne pas modifier à la main.
import hero480 from "@/assets/optimized/hero-v2-480.webp";
import hero960 from "@/assets/optimized/hero-v2-960.webp";
import hero1600 from "@/assets/optimized/hero-v2-1600.webp";
import heroJpg from "@/assets/hero-v2.jpg";
import tap480 from "@/assets/optimized/scan-v2-480.webp";
import tap960 from "@/assets/optimized/scan-v2-960.webp";
import tap1254 from "@/assets/optimized/scan-v2-1254.webp";
import tapJpg from "@/assets/scan-v2.jpg";
import generations480 from "@/assets/optimized/lifestyle-emotion-v2-480.webp";
import generations960 from "@/assets/optimized/lifestyle-emotion-v2-960.webp";
import generations1122 from "@/assets/optimized/lifestyle-emotion-v2-1122.webp";
import generationsJpg from "@/assets/lifestyle-emotion-v2.jpg";
import moments480 from "@/assets/optimized/product-moments-v2-480.webp";
import moments960 from "@/assets/optimized/product-moments-v2-960.webp";
import moments1536 from "@/assets/optimized/product-moments-v2-1536.webp";
import momentsJpg from "@/assets/product-moments-v2.jpg";
import envelope480 from "@/assets/optimized/product-envelope-v2-480.webp";
import envelope960 from "@/assets/optimized/product-envelope-v2-960.webp";
import envelope1254 from "@/assets/optimized/product-envelope-v2-1254.webp";
import envelopeJpg from "@/assets/product-envelope-v2.jpg";
import family480 from "@/assets/optimized/recto-family-v2-480.webp";
import family960 from "@/assets/optimized/recto-family-v2-960.webp";
import family1122 from "@/assets/optimized/recto-family-v2-1122.webp";
import familyJpg from "@/assets/recto-family-v2.jpg";

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
  hero: {
    src: heroJpg,
    srcSet: [`${hero480} 480w`, `${hero960} 960w`, `${hero1600} 1600w`].join(", "),
    width: 1672,
    height: 941,
    placeholder:
      "data:image/webp;base64,UklGRsIAAABXRUJQVlA4ILYAAACQBACdASoYAA0APtFWo0uoJKMhsAgBABoJQBOmUAS1QwNHcoDztZYCz9nFtgAA/vFHeHKCGlnCp4E2Uhl+xvDkAuq/wqK9yznseyiGzvlqpW4QLBgIjdDosQ4/BkTnelw4zlcc0jnKy7eKGWfdpM04R892SQmsgO3AIYMOef5W5b/h8LLG9WH30/g9RFAooOMRYPc/3UwxM6uToPQJb1nn8IobQBE/3cL4QcnV+c4FASWejPiAAA==",
  },
  tap: {
    src: tapJpg,
    srcSet: [`${tap480} 480w`, `${tap960} 960w`, `${tap1254} 1254w`].join(", "),
    width: 1254,
    height: 1254,
    placeholder:
      "data:image/webp;base64,UklGRgYBAABXRUJQVlA4IPoAAADwBQCdASoYABgAPtFao00oJSMiKA1RABoJYgCsEf/qYg3nCJHSb52QGVHCF2kEuw8ngGHfUitoAAD2Y+D4Hbx+xrOLGi9Xg54wYeNT9HSaVbACrE2IlkzVBBQTsY9gRl1bVi5yz4EQ0yFhRB+4Le6hx6l9GUdLjN+joySriyWJ2e+H+vqBtAgFozcyKVavhFaYvzJacCc4G/K2d8PVOkauqo0P3y6w83kaMkeFFgYAkGeu10SzJ8mNyQNNUyM5CvBGCDiHJxVNdmQ1awJPHaLRZO2zixkplTmKvUE5Vc2/ATEJtjgZ4f+hjCUwgXDM7mbE6OCzGANt6AAA",
  },
  generations: {
    src: generationsJpg,
    srcSet: [`${generations480} 480w`, `${generations960} 960w`, `${generations1122} 1122w`].join(
      ", ",
    ),
    width: 1122,
    height: 1402,
    placeholder:
      "data:image/webp;base64,UklGRlYBAABXRUJQVlA4IEoBAADQBgCdASoYAB4APtFUo0uoJKMhsAgBABoJQBXENQOMDSBM9DLw14Z//d428EbWP2/E+ooUNabsysDMGbf6RUAA/u/7SQJvet5isVQDXaTzsE33U8yVsywaoFQsliNPEwEpgAadIzizp4JwGdx8i/PGae4hfuJb4F0Zn4CJHU4NyRnGoFLW1QnkU3HZmKc5+ll77PnmS6QQm4gzrkTn3YNeH48PVc44PzDXQXRiLjkDjww/rKjyw16BmubW4R4o17CUhUAE0kh1JGT0H3y3ESCIYOEiIQGPQhDPWSVZaNC2aPXfrzx+FoRup2rMDj7NsYhOzIVRHKpAb0vnp/dtPWTNbfUHTzjeGhNaAOQ07UpDueMVsUx5H8YQxdMNNczsSasE8uhMaheuPbQ98a0ojaciV6KC2hXHxz5dSGL178c1RjcZkGo9PiUTEAA=",
  },
  moments: {
    src: momentsJpg,
    srcSet: [`${moments480} 480w`, `${moments960} 960w`, `${moments1536} 1536w`].join(", "),
    width: 1536,
    height: 1024,
    placeholder:
      "data:image/webp;base64,UklGRtgAAABXRUJQVlA4IMwAAAAQBQCdASoYABAAPtFUo0uoJKMhsAgBABoJbACdMoCGBEAGPcuCKoR5/pCKLr8pvwcAAP2+ojMox63Ne4gBaqdJ1hLVxsL6clE04RSu9LMLzGekGtiRmbGPIoiMuJ317ISF26RrefANsK6MHm0ts0nwbUZ9ju9ZS+ay6RCN2apd3JV2ZdPJrTCEGxeOak26I0Ohj7Oe86gy0noVlq0Nlzyyx1LMt07x7QX7UH6qwCZ+LNx2zh6zIhZ08REKyaoO1PY6xG0+5QW3xPIAAAA=",
  },
  envelope: {
    src: envelopeJpg,
    srcSet: [`${envelope480} 480w`, `${envelope960} 960w`, `${envelope1254} 1254w`].join(", "),
    width: 1254,
    height: 1254,
    placeholder:
      "data:image/webp;base64,UklGRgYBAABXRUJQVlA4IPoAAACQBQCdASoYABgAPtFgqE+oJSOiKAgBABoJQBajYdXr5ncLwGHqXHyHdtxvqRKFhXc6MjnVwADzvxhFptiT2T4ACdiS+zSmnbAyApGcWjdjnSDQJWI7A16cEanYjvrq9Dc4uZwgP3UKGjXsko0rf3pI89ZRQGFIbybIBI0p4oHr51ZCG6GtCpEnjRMmGWeWoWt3hvwZNPuVA1CG/AYd1aRLsJXi+UCxbjLo89tJ27VRLoZgRLcnnwPoetxcbuMYKOuh2mRH+qRFUYs4hexjo09vfu03kewtwi6Um5dclntkvWN3eGKGGFAFV8KIKGeqsuVFhr8vUMUgQAAA",
  },
  family: {
    src: familyJpg,
    srcSet: [`${family480} 480w`, `${family960} 960w`, `${family1122} 1122w`].join(", "),
    width: 1122,
    height: 1402,
    placeholder:
      "data:image/webp;base64,UklGRlYBAABXRUJQVlA4IEoBAAAwBwCdASoYAB4APtFSoEuoJKMhsAgBABoJYgC1CELJ/s0EEB2jZgOsgcWpk60DOyySzJKg9BJFYNdezhMg3cfIZAAA3k5gyE7ksY1EJftG4oxMezOYX7vGlcDeC+Ear0z05eAehLcAwC8phdZOnHouwIKsEDNi9UN13CNPpP3pQpzyjsbYnkgCtnuJCil2FWKNTw9yB0S68VyWS+ddZpiMigUOYsX9rRGlWlRlVYUfEMqyDJ4SKfkdIyX7hYLibDxPb6dH6WS1wPVx1uReSOKI5X5aEXvqjHj0lesNxuwDE0EMIw69WkL4j5+7sI3Dy9WAqmeZG5GBSkd1z7AkiAWCPVZ2zsqBvNvJmocVWVqt1b0/u6KIk3UPNFjkQgcHDW+eD6sHXHoeNhbc9fV8iYIapnRP80q4fnYQPfl8FFT5lCkV5SFliLHbQAA=",
  },
} satisfies Record<string, OptimizedImage>;
