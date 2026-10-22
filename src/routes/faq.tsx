import { createFileRoute } from "@tanstack/react-router";
import { PageHero } from "@/components/site/ProductCard";

export const Route = createFileRoute("/faq")({
  head: () => ({
    meta: [
      { title: "Foire aux Questions (FAQ) — MÉMORA" },
      {
        name: "description",
        content:
          "Toutes les réponses sur la photo connectée NFC Mémora : compatibilité smartphones, durée vidéo, notice au dos, livraison et sécurité.",
      },
    ],
  }),
  component: Faq,
});

const FAQ: [string, [string, string][]][] = [
  [
    "Fonctionnement & Technologie NFC",
    [
      [
        "Comment fonctionne la photo connectée MÉMORA ?",
        "Une puce NFC invisible et ultra-fine est intégrée à l'intérieur du tirage photo. Lorsque vous approchez votre smartphone (iPhone ou Android) de la photo, le téléphone détecte la puce et affiche une notification système. Il vous suffit d'appuyer dessus pour que votre vidéo se lance instantanément dans le navigateur web, sans aucune application.",
      ],
      [
        "Faut-il installer une application ?",
        "Non, absolument aucune application n'est nécessaire, ni pour vous lors de la commande, ni pour le destinataire lorsqu'il reçoit son souvenir.",
      ],
      [
        "Le destinataire saura-t-il comment l'utiliser tout seul ?",
        "Oui ! Chaque tirage photo Mémora comporte au verso une notice d'utilisation claire et soignée indiquant l'emplacement de contact et les 3 étapes simples. Il n'a besoin d'aucune assistance.",
      ],
      [
        "Quels smartphones sont compatibles ?",
        "Tous les iPhone à partir de l'iPhone XS (commercialisé en 2018) et ultérieurs, ainsi que la très grande majorité des smartphones Android récents dotés de la technologie NFC (Samsung, Google Pixel, Xiaomi, Huawei, etc.).",
      ],
    ],
  ],
  [
    "Vidéos & Montage",
    [
      [
        "Quelle est la durée maximale de la vidéo ?",
        "8 minutes complètes de vidéo sont incluses d'office dans chaque tirage. Si votre vidéo dure plus de 8 minutes, un supplément modique de 1,50 DT par minute supplémentaire est calculé automatiquement, jusqu'à un maximum de 30 minutes.",
      ],
      [
        "Je n'ai pas de montage tout fait, comment faire ?",
        "Nous mettons à votre disposition notre outil gratuit 'Montage Automatique' (Mémora Studio) : glissez simplement vos photos et clips vidéo, choisissez une musique d'ambiance et notre système assemble votre film avec rythme.",
      ],
      [
        "Quels formats de vidéo sont acceptés ?",
        "Nous acceptons tous les formats vidéo standards : MP4, MOV (iPhone), WebM, AVI, jusqu'à 5 Go par fichier.",
      ],
    ],
  ],
  [
    "Impression & Formats",
    [
      [
        "Sur quel papier sont imprimées les photos ?",
        "Nous utilisons un papier photographique d'art 300g/m² haute fidélité avec finition satinée anti-reflets pour garantir des couleurs profondes et une excellente longévité.",
      ],
      [
        "Quelle est la différence entre le Classique et le Magnet ?",
        "Le Classique est une carte photo d'art rigide 10×15 cm. Le Magnet possède en plus un dos entièrement magnétique qui adhère sur n'importe quel réfrigérateur ou surface métallique.",
      ],
    ],
  ],
  [
    "Tarifs dégressifs & Livraison",
    [
      [
        "Comment fonctionnent les tarifs dégressifs ?",
        "Dès 5 exemplaires commandés (qu'il s'agisse de la même photo ou de photos différentes), vous bénéficiez de réductions automatiques sur le prix unitaire : -14% dès 5 ex., -34% dès 10 ex., -48% dès 50 ex., et jusqu'à -60% dès 100 ex.",
      ],
      [
        "Quels sont les délais et frais de livraison ?",
        "Vos créations sont fabriquées en 48h et expédiées sous 3 à 5 jours ouvrés. La livraison est 100% offerte dès 250 DT d'achat.",
      ],
    ],
  ],
  [
    "Sécurité & Confidentialité",
    [
      [
        "Où sont stockées mes vidéos et sont-elles privées ?",
        "Vos vidéos sont hébergées sur des serveurs sécurisés, avec streaming ultra-rapide. Vos vidéos sont privées et ne sont jamais répertoriées publiquement sur internet.",
      ],
    ],
  ],
];

function Faq() {
  return (
    <>
      <PageHero
        eyebrow="Make Memories Last"
        title="Tout ce que vous devez savoir pour donner vie à vos souvenirs."
        intro="Des questions sur l'impression d'art, la magie de la puce NFC ou la livraison en Tunisie ? Nous vous répondons en toute simplicité."
      />
      <section className="container-x max-w-4xl pb-32">
        {FAQ.map(([cat, qs]) => (
          <div key={cat} className="mb-12">
            <p className="eyebrow mb-4 text-deep-brown font-semibold tracking-[0.2em]">{cat}</p>
            <div className="space-y-3">
              {qs.map(([q, a]) => (
                <details key={q} className="group rounded-2xl border border-sand/25 bg-card p-5 sm:p-6 shadow-2xs hover:shadow-luxury hover:border-sand/50 transition-all">
                  <summary className="flex cursor-pointer list-none items-center justify-between font-serif text-lg sm:text-xl text-charcoal font-medium">
                    <span>{q}</span>
                    <span className="text-sand group-open:rotate-45 transition-transform text-2xl font-light shrink-0 ml-4">
                      +
                    </span>
                  </summary>
                  <p className="mt-4 text-sm sm:text-base text-muted-foreground leading-relaxed pt-3 border-t border-sand/15">{a}</p>
                </details>
              ))}
            </div>
          </div>
        ))}
      </section>
    </>
  );
}
