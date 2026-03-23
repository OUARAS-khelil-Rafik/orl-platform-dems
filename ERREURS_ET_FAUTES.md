# Erreurs et Fautes à Corriger

## Fautes logiques corrigees

- [x] QCM lecture video: prise en charge correcte du mode multiple.
- [x] Navigation utilisateur: fermeture menu profil au clic exterieur et Echap.

## Fautes logiques a corriger (nouvelles)

- [x] Validation QCM potentiellement "correcte" avec selection vide quand aucune bonne reponse n'est configuree.
  - Impact: faux positifs de validation.
  - Fichier: pages/video-detail.tsx

- [x] Lecture QCM fragile si options manquantes en base (absence de garde runtime sur q.options).
  - Impact: risque de crash rendu sur donnees incompletes.
  - Fichier: pages/video-detail.tsx

- [x] Recherche non tolerante aux accents (specialite vs specialite, schema vs schema).
  - Impact: resultats de recherche incomplets pour l'utilisateur.
  - Fichier: components/search-modal.tsx

- [x] Resultat de recherche sans videoId non gere explicitement.
  - Impact: clic utilisateur sans navigation ni feedback.
  - Fichier: components/search-modal.tsx

- [x] Generation d'ID de questions basee sur Date.now()/Math.random() non deterministe.
  - Impact: collisions rares mais possibles, risque sur edition/suppression par ID.
  - Fichier: components/admin/content-manager.tsx

## Fautes de texte/consistance a garder en surveillance

- [x] Verifier en continu les accents FR dans les nouvelles pages/formulaires.
- [x] Maintenir une terminologie metier uniforme: "Cas cliniques", "Questions ouvertes", "Schemas".

## Note

- Ce fichier sert de backlog qualite logique + editorial.
- Marquer [x] uniquement apres correction code + validation manuelle ou test.
