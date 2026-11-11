import { cva, type VariantProps } from "class-variance-authority";
import type { ComponentPropsWithoutRef, ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * Briques partagées du site vitrine (direction « Le Verso »).
 * Les mêmes proportions que le parcours /commander : boutons pilule de 56px,
 * texte 16px en casse normale, vin sur lin.
 */
const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 rounded-full font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-60",
  {
    variants: {
      variant: {
        primary: "bg-m-wine text-m-linen hover:bg-m-ink",
        secondary: "border border-m-line-strong bg-m-paper text-m-ink hover:bg-m-blush",
        inverse: "bg-m-linen text-m-wine hover:bg-m-paper",
        link: "rounded-none px-0 text-m-wine underline decoration-m-rose underline-offset-4 hover:decoration-m-wine",
      },
      size: {
        lg: "min-h-14 px-7 text-base",
        md: "min-h-12 px-5 text-[15px]",
        inline: "min-h-11 text-base",
      },
    },
    compoundVariants: [{ variant: "link", class: "px-0" }],
    defaultVariants: { variant: "primary", size: "lg" },
  },
);

export type ButtonStyleProps = VariantProps<typeof buttonVariants> & { className?: string };

/** Classes d'un bouton ; tailwind-merge laisse la classe passée gagner (ex. « hidden md:inline-flex ») */
export function buttonStyles(props?: ButtonStyleProps) {
  return cn(buttonVariants(props));
}

/** Titre de page des pages intérieures */
export function PageHero({
  title,
  intro,
  children,
}: {
  title: string;
  intro?: string;
  children?: ReactNode;
}) {
  return (
    <section className="container-x pb-12 pt-12 md:pb-16 md:pt-20">
      <h1 className="max-w-3xl font-serif text-[40px] leading-[1.05] text-m-ink sm:text-[56px]">
        {title}
      </h1>
      {intro && <p className="mt-5 max-w-xl text-[17px] leading-relaxed text-m-muted">{intro}</p>}
      {children}
    </section>
  );
}

/** Titre de section : un h2 et, au besoin, une phrase d'explication */
export function SectionTitle({
  title,
  intro,
  id,
  className,
}: {
  title: string;
  intro?: string;
  id?: string;
  className?: string;
}) {
  return (
    <div className={cn("max-w-2xl", className)}>
      <h2 id={id} className="font-serif text-[30px] leading-[1.1] text-m-ink sm:text-[40px]">
        {title}
      </h2>
      {intro && <p className="mt-4 text-[17px] leading-relaxed text-m-muted">{intro}</p>}
    </div>
  );
}

const FIELD =
  "w-full rounded-2xl border border-m-line-strong bg-m-paper px-4 text-[17px] text-m-ink placeholder:text-m-step/70 focus:outline-2 focus:outline-offset-1 focus:outline-m-wine";

/** Champ de formulaire avec son libellé visible, relié par id */
export function Field({
  id,
  label,
  hint,
  multiline = false,
  rows,
  ...props
}: {
  id: string;
  label: string;
  hint?: string;
  multiline?: boolean;
} & ComponentPropsWithoutRef<"input"> &
  Pick<ComponentPropsWithoutRef<"textarea">, "rows">) {
  const describedBy = hint ? `${id}-hint` : undefined;
  return (
    <div>
      <label htmlFor={id} className="mb-1.5 block text-sm font-semibold text-m-muted">
        {label}
      </label>
      {multiline ? (
        <textarea
          id={id}
          aria-describedby={describedBy}
          rows={rows ?? 5}
          name={props.name}
          required={props.required}
          maxLength={props.maxLength}
          placeholder={props.placeholder}
          className={cn(FIELD, "resize-y py-3")}
        />
      ) : (
        <input
          id={id}
          aria-describedby={describedBy}
          {...props}
          className={cn(FIELD, "h-[54px]")}
        />
      )}
      {hint && (
        <p id={describedBy} className="mt-1.5 text-sm text-m-step">
          {hint}
        </p>
      )}
    </div>
  );
}

/** Liste déroulante assortie aux champs */
export function SelectField({
  id,
  label,
  options,
  ...props
}: {
  id: string;
  label: string;
  options: readonly (readonly [string, string])[];
} & ComponentPropsWithoutRef<"select">) {
  return (
    <div>
      <label htmlFor={id} className="mb-1.5 block text-sm font-semibold text-m-muted">
        {label}
      </label>
      <select id={id} {...props} className={cn(FIELD, "h-[54px] appearance-none")}>
        {options.map(([value, text]) => (
          <option key={value} value={value}>
            {text}
          </option>
        ))}
      </select>
    </div>
  );
}
