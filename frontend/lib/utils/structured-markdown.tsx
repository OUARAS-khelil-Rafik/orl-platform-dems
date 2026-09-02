'use client';

import * as React from 'react';
import ReactMarkdown from 'react-markdown';

/**
 * Normalise un texte médical saisi librement (QROC/QCM/ Cas clinique)
 * en Markdown structuré hiérarchique valide.
 *
 * Gère automatiquement les formats d'entrée observés côté DEMS :
 *  - 1-  / 1.  / 1)          →  1.   (liste ordonnée niv.0)
 *  - 2-1- / 2.1- / 2.1.     →  indented 1. (liste niv.1)
 *  - 2-1-1- / 2.1.1.        →  double indent niv.2
 *  - - / + / * / •         →  -  (liste non ordonnée)
 *  - :- Otologiques :      →  :\n   - Otologiques :
 *  - ; -                   →  ;\n   -  (inline bullets éclatés)
 *
 * Le rendu final utilise ReactMarkdown, donc seule une structure .md
 * correcte est nécessaire. Cette fonction est idempotente.
 */
export function normalizeStructuredMarkdown(input: string): string {
  if (!input) return '';
  let text = String(input).replace(/\r\n/g, '\n').trim();
  if (!text) return '';

  // 0) Nettoyage invisible : NBSP, puces exotiques, flèches inline (uniquement intra-ligne, pas en début de ligne)
  text = text.replace(/\u00A0/g, ' ').replace(/[•●▪]/g, '-');
  // Flèches inline " -> " / " => " → typographie soignée (espace simple, pas \s pour préserver les sauts de ligne)
  text = text.replace(/ -> /g, ' → ');
  text = text.replace(/ --> /g, ' → ');
  text = text.replace(/ => /g, ' ⇒ ');

  // 1) Éclater les bullets inline du type ":- Otologiques" , "; -" , ", - " , " : -"
  //    Ex: "1- Signes fonctionnels :- Otologiques : acouphènes" → 2 lignes
  //    On laisse l'indentation à la logique hiérarchique (bullets sous 1. → 3 espaces, sous 2.1. → 6 espaces)
  text = text.replace(/:\s*-\s+/g, ':\n- ');
  text = text.replace(/;\s*-\s+/g, ';\n- ');
  // Cas " - Neurologiques :" au milieu d'une phrase sans saut → on garde le saut déjà inséré
  // Si l'utilisateur a collé " - " après une virgule sans ":" on tente seulement si précédé d'un ";"
  // (on reste conservateur pour ne pas casser les phrases)

  // 2) Traitement ligne par ligne avec suivi de profondeur hiérarchique
  const rawLines = text.split('\n');
  const outLines: string[] = [];
  let previousWasList = false;
  let lastOrderedDepth = -1; // 0 = 1- , 1 = 2-1- , 2 = 2-1-1-
  let lastBulletIndent = '';

  for (let rawLine of rawLines) {
    const rawIndent = rawLine.match(/^\s*/)?.[0] || '';
    const trimmed = rawLine.trim();
    if (!trimmed) {
      outLines.push('');
      previousWasList = false;
      // ne pas réinitialiser lastOrderedDepth pour garder l'attachement des bullets suivants
      continue;
    }

    // Détection hiérarchique : 2.1.1- / 2-1-1- / 3.2- etc (3 niveaux max) — prioritaire
    const tripleMatch = trimmed.match(/^(\d+)\s*[-.]\s*(\d+)\s*[-.]\s*(\d+)\s*[-.)]?\s*(.*)$/);
    if (tripleMatch) {
      const [, , , n3, rest] = tripleMatch;
      const marker = `${n3}.`;
      outLines.push(`      ${marker} ${rest}`.trimEnd());
      previousWasList = true;
      lastOrderedDepth = 2;
      lastBulletIndent = '         - '; // 9 spaces pour bullet enfant de triple
      continue;
    }

    const doubleMatch = trimmed.match(/^(\d+)\s*[-.]\s*(\d+)\s*[-.)]?\s*(.*)$/);
    if (doubleMatch) {
      const [, , n2, rest] = doubleMatch;
      outLines.push(`   ${n2}. ${rest}`.trimEnd());
      previousWasList = true;
      lastOrderedDepth = 1;
      lastBulletIndent = '      - '; // 6 spaces pour bullet enfant de double
      continue;
    }

    const singleMatch = trimmed.match(/^(\d+)\s*[-.)]\s+(.*)$/);
    if (singleMatch) {
      const [, n1, rest] = singleMatch;
      // Idempotence : si la ligne était déjà indentée (ex: "   1. Otoscopie" issue d'une normalisation précédente),
      // on conserve l'indentation d'origine pour ne pas aplatir la hiérarchie.
      if (rawIndent.length >= 6) {
        outLines.push(`      ${n1}. ${rest}`.trimEnd());
        lastOrderedDepth = 2;
        lastBulletIndent = '         - ';
      } else if (rawIndent.length >= 3) {
        outLines.push(`   ${n1}. ${rest}`.trimEnd());
        // Si on est déjà sous un parent double, garder depth 1
        lastOrderedDepth = lastOrderedDepth === 1 ? 1 : 1;
        lastBulletIndent = '      - ';
      } else {
        outLines.push(`${n1}. ${rest}`.trimEnd());
        lastOrderedDepth = 0;
        lastBulletIndent = '   - ';
      }
      previousWasList = true;
      continue;
    }

    // Lignes fléchées : "->", "- >", "→", "»", "=>", "-->" → rendu "→" (row fléché)
    // Doit être avant la détection bullet pour ne pas être capturé comme "- >" bullet normal.
    const arrowMatch = trimmed.match(/^(?:[-*+]\s*)?(?:->|-->|—>|→|–>|»|=>|>)\s+(.*)$/);
    if (arrowMatch) {
      const rest = arrowMatch[1] ?? '';
      // Idempotence : si déjà indenté avec arrow, conserver
      if (rawIndent.length >= 9) {
        outLines.push(`         - → ${rest}`.trimEnd());
        previousWasList = true;
        continue;
      }
      if (rawIndent.length >= 6) {
        outLines.push(`      - → ${rest}`.trimEnd());
        previousWasList = true;
        continue;
      }
      if (rawIndent.length >= 3) {
        outLines.push(`   - → ${rest}`.trimEnd());
        previousWasList = true;
        continue;
      }
      // Indentation hiérarchique comme bullet, mais avec flèche
      let indent: string;
      if (previousWasList) {
        if (lastOrderedDepth === 1) indent = '      - → ';
        else if (lastOrderedDepth === 2) indent = '         - → ';
        else if (lastOrderedDepth === 0) indent = '   - → ';
        else indent = lastBulletIndent ? lastBulletIndent.replace(/-\s*$/, '- → ') : '- → ';
      } else {
        indent = '- → ';
      }
      const lastOut = outLines[outLines.length - 1] || '';
      const lastWasBullet = /^\s*-\s/.test(lastOut);
      const lastWasArrow = /^\s*-\s*→\s/.test(lastOut);
      if (lastWasBullet || lastWasArrow) {
        const leadingSpaces = lastOut.match(/^\s*/)?.[0] || '';
        // réutiliser même niveau que précédent bullet/arrow
        const isArrowPrev = /^\s*-\s*→\s/.test(lastOut);
        indent = isArrowPrev ? `${leadingSpaces}- → ` : `${leadingSpaces}- → `;
        // Si précédent était bullet normal (sans flèche), on reste en bullet fléché au même niveau
        if (!isArrowPrev) {
          // conserver indent fléché au même niveau que bullet précédent
          indent = `${leadingSpaces}- → `;
        }
      }
      outLines.push(`${indent}${rest}`.trimEnd());
      previousWasList = true;
      continue;
    }

    // Listes non ordonnées : -, +, *
    const bulletMatch = trimmed.match(/^([-+*])\s*(.*)$/);
    if (bulletMatch) {
      const [, , rest] = bulletMatch;
      // Idempotence : si déjà indenté, conserver l'indentation d'origine
      if (rawIndent.length >= 6) {
        outLines.push(`${'      '}- ${rest}`.trimEnd().replace(/^\s*-\s*/, '      - '));
        // garder 6 espaces si rawIndent 6, ou 9 si plus
        if (rawIndent.length >= 9) {
          outLines[outLines.length - 1] = `${'         '}- ${rest}`.trimEnd().replace(/^\s*-\s*/, '         - ');
        }
        previousWasList = true;
        continue;
      }
      if (rawIndent.length >= 3 && rawIndent.length < 6) {
        // déjà à 3 espaces → conserver
        outLines.push(`   - ${rest}`.trimEnd());
        previousWasList = true;
        continue;
      }
      // Indentation hiérarchique : bullet s'attache au dernier niveau ordonné
      let indent: string;
      if (previousWasList) {
        if (lastOrderedDepth === 1) indent = '      - ';
        else if (lastOrderedDepth === 2) indent = '         - ';
        else if (lastOrderedDepth === 0) indent = '   - ';
        else indent = lastBulletIndent || '- ';
      } else {
        indent = '- ';
      }
      const lastOut = outLines[outLines.length - 1] || '';
      const lastWasBullet = /^\s*-\s/.test(lastOut);
      if (lastWasBullet) {
        const leadingSpaces = lastOut.match(/^\s*/)?.[0] || '';
        indent = `${leadingSpaces}- `;
      }
      outLines.push(`${indent}${rest}`.trimEnd());
      previousWasList = true;
      continue;
    }

    // Ligne de titre se terminant par ":" sans marker → on la garde telle quelle
    outLines.push(trimmed);
    previousWasList = false;
  }

  // 3) Post-traitement : compacter les multiples lignes vides
  let result = outLines.join('\n');
  result = result.replace(/\n{3,}/g, '\n\n');
  // Supprimer l'espace final par ligne
  result = result
    .split('\n')
    .map((l) => l.trimEnd())
    .join('\n')
    .trim();

  return result;
}

/**
 * Classe Tailwind partagée pour le rendu médical structuré.
 * - Hiérarchie lisible : ol avec list-decimal, ul avec list-disc
 * - Indentation progressive, interlignage aéré, accents DEMS
 * - Support dark/light via variables CSS
 */
export const structuredMarkdownClassName = [
  'structured-markdown',
  'text-[15px] leading-[1.65] text-[var(--app-text)]',
  'max-w-none',
  '[&_p]:my-2 [&_p]:leading-relaxed',
  '[&_strong]:font-semibold [&_strong]:text-[var(--app-text)]',
  '[&_em]:italic',
  // Listes ordonnées racine
  '[&_ol]:my-2 [&_ol]:list-decimal [&_ol]:pl-6 [&_ol]:space-y-1.5',
  '[&_ol_ol]:my-1.5 [&_ol_ol]:list-decimal [&_ol_ol]:pl-5',
  '[&_ol_ol_ol]:list-decimal',
  // Listes non ordonnées
  '[&_ul]:my-2 [&_ul]:list-disc [&_ul]:pl-6 [&_ul]:space-y-1',
  '[&_ul_ul]:list-disc [&_ul_ul]:pl-5',
  // Items
  '[&_li]:leading-relaxed [&_li]:marker:text-[var(--app-accent)]',
  // Séparateurs visuels pour les titres "2- Signes physiques :"
  '[&_li>p]:my-0',
  '[&_hr]:my-4 [&_hr]:border-[var(--app-border)]',
  // Citations éventuelles
  '[&_blockquote]:border-l-2 [&_blockquote]:border-[var(--app-accent)] [&_blockquote]:pl-3 [&_blockquote]:italic [&_blockquote]:text-[var(--app-muted)]',
  // Code inline (rare mais prévu)
  '[&_code]:rounded [&_code]:bg-[var(--app-surface-2)] [&_code]:px-1 [&_code]:py-0.5 [&_code]:text-[13px]',
].join(' ');

export type StructuredMarkdownProps = {
  content?: string | null;
  className?: string;
  /**
   * Si true, le texte est d'abord normalisé (1- → 1., 2-1- → indent, etc.).
   * Désactiver seulement si le contenu est déjà du Markdown valide et que
   * vous voulez éviter toute transformation.
   */
  normalize?: boolean;
  /**
   * Classe de texte alternative (ex: "text-lg" pour les réponses).
   * Fusionnée avec structuredMarkdownClassName.
   */
  textClassName?: string;
};

function isArrowLiChildren(children: React.ReactNode): boolean {
  const flat: string[] = [];
  React.Children.forEach(children, (child) => {
    if (typeof child === 'string') flat.push(child);
    else if (React.isValidElement(child)) {
      const props = child.props as { children?: React.ReactNode };
      if (typeof props.children === 'string') flat.push(props.children);
      else if (Array.isArray(props.children)) {
        props.children.forEach((c: unknown) => {
          if (typeof c === 'string') flat.push(c as string);
        });
      }
    }
  });
  const text = flat.join('').trimStart();
  return text.startsWith('→');
}

function stripArrowFromChildren(children: React.ReactNode): React.ReactNode {
  return React.Children.map(children, (child) => {
    if (typeof child === 'string') {
      return (child as string).replace(/^\s*→\s*/, '');
    }
    if (React.isValidElement(child)) {
      const props = child.props as { children?: React.ReactNode };
      const inner = props.children;
      if (typeof inner === 'string') {
        const stripped = (inner as string).replace(/^\s*→\s*/, '');
        return React.cloneElement(child as React.ReactElement<{ children?: React.ReactNode }>, undefined, stripped);
      }
      if (Array.isArray(inner) && typeof inner[0] === 'string') {
        const first = (inner[0] as string).replace(/^\s*→\s*/, '');
        const rest = (inner as unknown[]).slice(1);
        return React.cloneElement(
          child as React.ReactElement<{ children?: React.ReactNode }>,
          undefined,
          [first, ...(rest as React.ReactNode[])],
        );
      }
    }
    return child;
  });
}

export function StructuredMarkdown({
  content,
  className = '',
  normalize = true,
  textClassName = '',
}: StructuredMarkdownProps) {
  const raw = String(content ?? '').trim();
  if (!raw) return null;

  const normalized = normalize ? normalizeStructuredMarkdown(raw) : raw;

  return (
    <div className={[structuredMarkdownClassName, textClassName, className].filter(Boolean).join(' ')}>
      <ReactMarkdown
        components={{
          li: ({ children, ...props }) => {
            const isArrow = isArrowLiChildren(children);
            if (isArrow) {
              const stripped = stripArrowFromChildren(children);
              return (
                <li className="arrow-row" {...props}>
                  {stripped}
                </li>
              );
            }
            return <li {...props}>{children}</li>;
          },
        }}
      >
        {normalized}
      </ReactMarkdown>
    </div>
  );
}

export default StructuredMarkdown;
