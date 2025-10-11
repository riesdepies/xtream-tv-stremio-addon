# Stremio IPTV Addon voor Vercel

Dit is een voorbeeldproject voor een simpele Stremio IPTV-addon die ontworpen is om moeiteloos te worden gedeployed op [Vercel](https://vercel.com).

## Hoe het werkt

*   **`api/addon.js`**: Een serverless Node.js functie die de Stremio addon-logica bevat. Vercel routeert alle requests naar `/api/addon/*` automatisch naar dit bestand.
*   **`public/index.html`**: Een statische landingspagina waar gebruikers de addon kunnen installeren. Vercel serveert bestanden in de `public` map vanaf de root van de website.

## Deployment naar Vercel

1.  **Fork of clone deze repository.**
2.  **Push het naar je eigen GitHub account.**
3.  **Importeer het project in Vercel:**
    *   Ga naar je Vercel Dashboard en klik op "Add New... -> Project".
    *   Selecteer je GitHub repository.
    *   Vercel zal automatisch detecteren dat het een Node.js project is. Er zijn geen aanpassingen nodig aan de build settings.
4.  **Klik op "Deploy".**

Na de deployment zal Vercel je een URL geven (bijv. `https://jouw-project.vercel.app`). Als je naar deze URL gaat, zie je de landingspagina en kun je de addon installeren.
