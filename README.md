# Coral & Cove: A Sea Turtle Odyssey

A tranquil 3D two-player ocean exploration game. A mother sea turtle and her hatchling swim together through coral reefs, shipwrecks, kelp forests and tropical island beaches. Built with React, Three.js and Vite.

## Run it locally

```bash
npm install
```

```bash
npm run dev
```

Then open http://localhost:3000.

## Controls

- Player 1 (Mother Kaimana): WASD
- Player 2 (Baby Lani): arrow keys
- Two game controllers are also supported

## Google Drive saves (optional)

The game runs without any keys. To switch on "Google Drive Saves & Postcards", copy `.env.example` to `.env.local` and fill in your Firebase web app settings. `.env.local` and `firebase-applet-config.json` are git-ignored on purpose: do not commit them.

## Scripts

- `npm run dev`: start the dev server
- `npm run build`: production build into `dist/`
- `npm run lint`: type-check

## Hosting

Cloudflare builds and publishes the game from `main` using `wrangler.jsonc`. The repo uses an npm lockfile (`package-lock.json`) because Cloudflare's build image could not read the newer `bun.lock` format.
