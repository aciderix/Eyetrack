# Eyetrack

Eyetrack est une application React permettant de contrôler une interface web à l'aide du regard, en utilisant la caméra de l'appareil. Le système propose un étalonnage rapide, une compensation des mouvements de tête (rotation, inclinaison et variations de distance) et une interface adaptée aux utilisateurs à mobilité réduite.

## Fonctionnalités principales

- **Suivi du regard en temps réel** basé sur Mediapipe Face Mesh avec affinage des repères oculaires.
- **Étalonnage accessible** sur neuf points, déclenchable au clavier (Entrée/Espace) ou à la souris.
- **Compensation automatique des mouvements de tête** (yaw, pitch, roll et distance) pour limiter les dérives du curseur.
- **Curseur visuel** optionnel pour afficher le point de regard détecté.
- **Panneau de statut** indiquant l'état des autorisations caméra, de la détection du visage et des messages contextuels.
- **Conseils d'accessibilité** pour faciliter l'installation et l'utilisation par les personnes présentant des limitations motrices.

## Démarrage du projet

1. Installez les dépendances :

   ```bash
   npm install
   ```

2. Lancez le serveur de développement :

   ```bash
   npm run dev
   ```

3. Ouvrez l'application via l'URL fournie (par défaut `http://localhost:5173`) et autorisez l'accès à la caméra.

## Étalonnage

1. Cliquez sur **« Activer le suivi »** pour initialiser la caméra et le modèle.
2. Lancez l'étalonnage depuis le panneau latéral.
3. Fixez chaque point bleu successivement puis validez-le avec la barre d'espace, la touche Entrée ou le bouton « Valider le point ».
4. Une fois les neuf points enregistrés, le système applique automatiquement la calibration et la compensation de tête.

Vous pouvez relancer l'étalonnage à tout moment, notamment si vous changez de position ou d'appareil.

## Accessibilité

- Les instructions d'étalonnage sont annoncées dynamiquement (aria-live) pour les lecteurs d'écran.
- Toutes les actions critiques disposent d'équivalents clavier.
- L'interface est contrastée, responsive et s'adapte aux tablettes et ordinateurs.

## Scripts disponibles

- `npm run dev` : lance le serveur de développement Vite.
- `npm run build` : génère une version de production.
- `npm run preview` : prévisualise la version de production.
- `npm run lint` : exécute ESLint sur le dossier `src`.

## Déploiement sur Netlify

Pour que Netlify trouve les scripts npm, laissez le répertoire de base vide (racine du dépôt) et définissez simplement :

- **Build command** : `npm run build`
- **Publish directory** : `dist`

Le fichier [`netlify.toml`](./netlify.toml) fixe également cette configuration et impose Node.js 20 pour assurer la compatibilité avec Vite.

## Licence

Ce projet est distribué sous licence MIT.
