# Contribuer au projet ORL Platform DEMS

## Prérequis

- Node.js 20+
- npm 9+

## Installation

```bash
npm install
```

## Lancer le projet en local

```bash
npm run dev
```

## Vérifications avant PR

```bash
npm run lint
npm test
npm run test:coverage
```

## Conventions de code

- Utiliser TypeScript strictement typé et éviter `any`.
- Centraliser les modèles partagés dans `lib/models.ts`.
- Conserver des textes UI en français cohérents.
- Ajouter des tests sur les zones critiques lors de toute évolution fonctionnelle.

## Workflow recommandé

1. Créer une branche dédiée.
2. Implémenter la fonctionnalité avec gestion d'erreurs explicite.
3. Ajouter/adapter les tests.
4. Exécuter lint, tests et couverture.
5. Ouvrir la PR avec contexte fonctionnel et technique.

## Definition of Done

- Tous les contrôles CI passent: lint, tests, couverture.
- Les cas limites sont traités (données manquantes/invalides).
- Aucun comportement régressif sur les flux utilisateur principaux.
- La documentation impactée est mise à jour.
- La checklist TODO/qualité est alignée avec l'état réel du code.
