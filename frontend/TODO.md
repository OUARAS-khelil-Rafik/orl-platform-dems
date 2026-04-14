# TODO Projet DEMS ENT

## Phase 1 - Stabilisation Fonctionnelle (Termine)

- [x] Corriger la logique QCM en mode multiple cote lecture video.
- [x] Ajouter les QROC dans la recherche globale.
- [x] Ajouter l'onglet QROC dans la lecture video.
- [x] Integrer les QROC au seed admin.
- [x] Fermer le menu profil au clic exterieur et a la touche Echap.
- [x] Adapter la navigation/footer pour le role admin.

## Phase 2 - Qualite de Code et Typage (Termine)

- [x] Factoriser les modeles partages dans lib/domain/models.ts.
- [x] Reduire les any dans les ecrans critiques admin/lecture.
- [x] Uniformiser les textes FR prioritaires dans l'interface.
- [x] Ajouter la base de tests UI (Vitest + Testing Library).

## Phase 3 - Couverture Tests et Robustesse (En cours)

- [x] Tests UI: menu profil (ouverture/fermeture).
- [x] Tests UI: navigation onglets video.
- [x] Tests UI: validation QCM single/multiple.
- [x] Ajouter tests d'integration pour recherche (video, cas, QCM, QROC).
- [x] Ajouter tests de non-regression sur acces role (admin, vip_plus, user).
- [x] Ajouter tests sur cas limites donnees invalides (QCM sans options/corrections).

## Phase 4 - Nouveaux TODO Logiques (Priorite haute)

- [x] Bloquer la validation d'un QCM si aucune reponse correcte n'est configuree en base.
  - Fichier cible: pages/video-detail.tsx
- [x] Ajouter une protection runtime si q.options est absent/non tableau dans la lecture QCM.
  - Fichier cible: pages/video-detail.tsx
- [x] Rendre la recherche tolerante aux accents (ex: specialite/specialite, schema/schema).
  - Fichier cible: components/features/search/search-modal.tsx
- [x] Gerer explicitement les resultats de recherche sans videoId (message ou fallback).
  - Fichier cible: components/features/search/search-modal.tsx
- [x] Remplacer la generation d'ID de questions basee sur Date.now()/Math.random() par un ID plus robuste.
  - Fichier cible: components/features/admin/content-manager.tsx

## Phase 5 - Qualite Produit (Nouveaux)

- [x] Ajouter un mode "previsualisation" des contenus pedagogiques cote admin.
- [x] Ajouter une verification de coherence contenu par video (cas + qcm + schema + open).
- [x] Afficher des messages d'erreur utilisateur plus explicites sur echec de sauvegarde.
- [x] Ajouter un rapport de completion pedagogique par sous-specialite.

## Phase 6 - Industrialisation (Nouveaux)

- [x] Ajouter pipeline CI (lint + typecheck + tests) sur pull request.
- [x] Ajouter seuil minimal de couverture tests pour les zones critiques.
- [x] Ajouter logs metier sur creation/modification/suppression de contenu admin.
- [x] Ajouter une section "Definition of Done" dans CONTRIBUTING.md.
