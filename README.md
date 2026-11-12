# Coral & Cove: A Sea Turtle Odyssey

A tranquil 3D two-player ocean exploration game. A mother sea turtle and her hatchling swim together through coral reefs, shipwrecks, kelp forests and tropical island beaches. Built with React, Three.js and Vite.

## Run it locally

```bash
bun install
```

```bash
bun run dev
```

Then open http://localhost:3000. `npm install` and `npm run dev` work too.

## Controls

- Player 1 (Mother Kaimana): WASD
- Player 2 (Baby Lani): arrow keys
- Two game controllers are also supported

## Google Drive saves (optional)

The game runs without any keys. To switch on "Google Drive Saves & Postcards", copy `.env.example` to `.env.local` and fill in your Firebase web app settings. `.env.local` and `firebase-applet-config.json` are git-ignored on purpose: do not commit them.

## Scripts

- `bun run dev`: start the dev server
- `bun run build`: production build into `dist/`
- `bun run lint`: type-check
