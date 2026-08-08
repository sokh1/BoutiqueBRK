# Boutique B.R.K — Application installable (PWA)

Ce dossier contient tout ce qu'il faut pour publier l'application sur GitHub et
l'installer comme une vraie application sur téléphone (Android/iOS), à partir
d'un lien https (obligatoire pour qu'un téléphone propose "Ajouter à l'écran
d'accueil").

## Contenu du dossier

- `index.html` — l'application (v56, avec support PWA).
- `manifest.json` — décrit l'app (nom, icônes, couleurs) pour l'installation.
- `sw.js` — service worker : charge l'appli plus vite et permet un usage
  hors-ligne pour l'interface (les données passent toujours par Google Sheets
  dès qu'une connexion est disponible — jamais mises en cache).
- `icon-192.png`, `icon-512.png`, `icon-512-maskable.png`, `apple-touch-icon.png`,
  `favicon-32.png` — icônes de l'application.
- `Code.gs` — le script Google Apps Script (backend). Il ne fait PAS partie du
  site GitHub Pages : il se déploie séparément dans Google Apps Script, comme
  avant (voir l'en-tête du fichier pour les instructions).

## 1. Créer le dépôt GitHub

1. Va sur https://github.com/new
2. Nom du dépôt : `BoutiqueBRK`
3. Visibilité : **Public** (nécessaire pour GitHub Pages gratuit sur un compte
   personnel standard).
4. Crée le dépôt (sans README, il y en a déjà un ici).

## 2. Envoyer les fichiers

**Option simple (sans ligne de commande) :**
Sur la page du dépôt, clique sur "Add file" → "Upload files", puis glisse tous
les fichiers de ce dossier (sauf ce README si tu préfères en garder un autre,
sinon garde-le aussi) et clique "Commit changes".

**Option avec Git :**
```bash
cd chemin/vers/ce/dossier
git init
git remote add origin https://github.com/<TON_NOM_UTILISATEUR>/BoutiqueBRK.git
git add .
git commit -m "Boutique B.R.K v56 - version installable (PWA)"
git branch -M main
git push -u origin main
```

## 3. Activer GitHub Pages

1. Dans le dépôt : Settings → Pages (menu de gauche).
2. Source : "Deploy from a branch".
3. Branch : `main`, dossier `/ (root)`. Enregistrer.
4. Attends 1 à 2 minutes. Le site sera en ligne à l'adresse :
   `https://<TON_NOM_UTILISATEUR>.github.io/BoutiqueBRK/`

## 4. Installer l'application sur le téléphone

Ouvre cette adresse `https://<TON_NOM_UTILISATEUR>.github.io/BoutiqueBRK/`
dans le navigateur du téléphone :

- **Android (Chrome)** : un bandeau "Ajouter Boutique B.R.K à l'écran
  d'accueil" apparaît automatiquement, ou via le menu ⋮ → "Installer
  l'application".
- **iPhone (Safari)** : bouton Partager (carré avec flèche) → "Sur l'écran
  d'accueil".

L'icône apparaît alors comme une vraie application, en plein écran, sans
barre d'adresse.

## Important : reconfigurer l'URL Google Sheet une fois

L'appli enregistre localement (dans le navigateur) l'URL de ton script Google
Apps Script et tes préférences. Comme `https://<toi>.github.io/...` est une
nouvelle adresse (différente du fichier que tu utilisais avant), il faudra
recoller une fois l'URL Google Apps Script dans Réglages après la première
ouverture sur ce nouveau lien. Une fois fait, elle reste enregistrée sur
l'appareil.

## Mettre à jour l'application plus tard

Pour toute future mise à jour, remplace `index.html` (et `sw.js`/`manifest.json`
si besoin) par la nouvelle version dans le dépôt GitHub (upload ou `git push`).
GitHub Pages republie automatiquement en 1-2 minutes.
