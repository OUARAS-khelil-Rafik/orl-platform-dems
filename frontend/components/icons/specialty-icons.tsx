'use client';

import * as React from 'react';

// Icône Nez (vue de face) — style lucide (stroke 2, round)
export const NoseIcon = React.forwardRef<SVGSVGElement, React.SVGProps<SVGSVGElement>>((props, ref) => (
  <svg
    ref={ref}
    xmlns="http://www.w3.org/2000/svg"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth={2}
    strokeLinecap="round"
    strokeLinejoin="round"
    {...props}
  >
    {/* arête du nez */}
    <path d="M12 4 C10.2 7 8.5 11 9 15.5" />
    <path d="M12 4 C13.8 7 15.5 11 15 15.5" />
    {/* pointe / base du nez */}
    <path d="M9 15.5 C9 18 10.2 19.5 12 19.5 C13.8 19.5 15 18 15 15.5" />
    {/* cloison */}
    <path d="M12 12.5 L12 19.5" />
    {/* narines */}
    <path d="M9.4 16.2 C9.8 17 10.6 17.3 11.2 16.4" />
    <path d="M14.6 16.2 C14.2 17 13.4 17.3 12.8 16.4" />
  </svg>
));
NoseIcon.displayName = 'NoseIcon';

// Icône Cou / Larynx (vue de face) — tête + cou + larynx
export const NeckIcon = React.forwardRef<SVGSVGElement, React.SVGProps<SVGSVGElement>>((props, ref) => (
  <svg
    ref={ref}
    xmlns="http://www.w3.org/2000/svg"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth={2}
    strokeLinecap="round"
    strokeLinejoin="round"
    {...props}
  >
    {/* contour tête */}
    <path d="M9 3.5 H15" />
    <path d="M9 3.5 C7.2 4.2 6.5 6.8 7.5 9 L9.2 11.8" />
    <path d="M15 3.5 C16.8 4.2 17.5 6.8 16.5 9 L14.8 11.8" />
    {/* cou */}
    <path d="M9.2 11.8 L9.2 20.5 H14.8 L14.8 11.8" />
    {/* larynx / pomme d'Adam */}
    <path d="M12 11.8 L12 15" />
    <path d="M11 13.5 L12 15 L13 13.5" />
    <path d="M10.2 15 C10.2 16.2 10.8 17 12 17 C13.2 17 13.8 16.2 13.8 15" />
    {/* plis cervicaux légers */}
    <path d="M9.2 15.5 H10.2" />
    <path d="M13.8 15.5 H14.8" />
  </svg>
));
NeckIcon.displayName = 'NeckIcon';

// Icône Larynx pur — cartilage thyroïde + cordes vocales + trachée (style lucide)
export const LarynxIcon = React.forwardRef<SVGSVGElement, React.SVGProps<SVGSVGElement>>((props, ref) => (
  <svg
    ref={ref}
    xmlns="http://www.w3.org/2000/svg"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth={2}
    strokeLinecap="round"
    strokeLinejoin="round"
    {...props}
  >
    {/* cartilage thyroïde - bouclier */}
    <path d="M12 3.5 L7.5 7.5 L8.2 12.5 C8.6 14.2 10 15.5 12 15.5 C14 15.5 15.4 14.2 15.8 12.5 L16.5 7.5 L12 3.5 Z" />
    {/* échancrure thyroïdienne */}
    <path d="M12 3.5 L12 6" />
    {/* cordes vocales - vue supérieure */}
    <path d="M9.5 9.5 L12 11.5 L14.5 9.5" />
    <path d="M9.5 11.5 H14.5" />
    {/* cartilage cricoïde */}
    <path d="M9.5 15.5 C9.5 16.8 10.4 17.8 12 17.8 C13.6 17.8 14.5 16.8 14.5 15.5" />
    {/* trachée - anneaux */}
    <path d="M9 17.8 H15" />
    <path d="M9.4 19.5 H14.6" />
    <path d="M9.8 21.2 H14.2" />
  </svg>
));
LarynxIcon.displayName = 'LarynxIcon';

// Icônes Flaticon — PNG 512 (noir sur transparent) sourcés depuis flaticon.com
// nose_5051503 — https://www.flaticon.com/free-icon/nose_5051503
// anatomy_14476434 — https://www.flaticon.com/free-icon/anatomy_14476434 (larynx, remplace larynx_5877839)
// Technique masque : le PNG sert de masque, backgroundColor = currentColor => même couleur que Ear (lucide)
export const NoseFlatIcon = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  (props, ref) => {
    const { className, style, ...rest } = props as React.HTMLAttributes<HTMLDivElement> & { className?: string; style?: React.CSSProperties };
    const color = (style as React.CSSProperties)?.color as string | undefined;
    return (
      <div
        ref={ref}
        className={className}
        role="img"
        aria-label="Nez"
        {...rest}
        style={{
          WebkitMaskImage: 'url(/icons/nose-flaticon.png)',
          maskImage: 'url(/icons/nose-flaticon.png)',
          WebkitMaskSize: 'contain',
          maskSize: 'contain',
          WebkitMaskRepeat: 'no-repeat',
          maskRepeat: 'no-repeat',
          WebkitMaskPosition: 'center',
          maskPosition: 'center',
          ...style,
          backgroundColor: color || (style?.backgroundColor as string) || 'currentColor',
        }}
      />
    );
  },
);
NoseFlatIcon.displayName = 'NoseFlatIcon';

export const LarynxFlatIcon = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  (props, ref) => {
    const { className, style, ...rest } = props as React.HTMLAttributes<HTMLDivElement> & { className?: string; style?: React.CSSProperties };
    const color = (style as React.CSSProperties)?.color as string | undefined;
    return (
      <div
        ref={ref}
        className={className}
        role="img"
        aria-label="Larynx"
        {...rest}
        style={{
          WebkitMaskImage: 'url(/icons/larynx-flaticon.png)',
          maskImage: 'url(/icons/larynx-flaticon.png)',
          WebkitMaskSize: 'contain',
          maskSize: 'contain',
          WebkitMaskRepeat: 'no-repeat',
          maskRepeat: 'no-repeat',
          WebkitMaskPosition: 'center',
          maskPosition: 'center',
          ...style,
          backgroundColor: color || (style?.backgroundColor as string) || 'currentColor',
        }}
      />
    );
  },
);
LarynxFlatIcon.displayName = 'LarynxFlatIcon';
