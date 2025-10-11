# Dynamische Stremio Xtream Addon voor Vercel

Dit project is een Stremio-addon die dynamisch IPTV-kanalen ophaalt van een of meer Xtream Codes-providers. Gebruikers kunnen de addon configureren via een webpagina, en de configuratie wordt direct in de installatielink gecodeerd.

## Hoe het werkt

*   **`public/index.html` & `public/configure.js`**: Een statische webpagina waar gebruikers hun M3U-URL's kunnen invoeren. De Javascript-code op de pagina parseert de URL, valideert het account via een proxy, en bouwt een configuratie-object. Dit object wordt met Base64 gecodeerd en in een `stremio://` installatielink geplaatst.
*   **`api/index.js`**: Een serverless Node.js functie die alle logica bevat.
    *   **Proxy**: Het fungeert als een CORS-proxy voor de frontend, zodat de browser accountinformatie en categorieën kan ophalen van de Xtream Codes server.
    *   **Addon Server**: Het leest de Base64-configuratie uit de URL (`/:config/...`), bouwt een Stremio addon-interface en serveert het manifest, de catalogus en de streams op basis van die configuratie.

## Deployment naar Vercel

1.  **Fork of clone deze repository.**
2.  **Push het naar je eigen GitHub/GitLab/Bitbucket account.**
3.  **Importeer het project in Vercel:**
    *   Ga naar je Vercel Dashboard en klik op "Add New... -> Project".
    *   Selecteer je Git repository.
    *   Vercel detecteert automatisch de `package.json` en de `api` map. Er zijn geen aanpassingen aan de build-instellingen nodig.
4.  **Klik op "Deploy".**

Na de deployment krijg je een URL (bijv. `jouw-project.vercel.app`). Als je naar deze URL gaat, zie je de configuratiepagina waar je je Xtream Codes account(s) kunt toevoegen en de addon kunt installeren.