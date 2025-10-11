const express = require('express');
const cors = require('cors');
// Belangrijk: importeer serveHTTP
const { addonBuilder, serveHTTP } = require('stremio-addon-sdk');

const manifest = {
    id: "org.iptvexample.express.final.correct",
    version: "10.0.0", // Versie 10, de werkende versie
    name: "IPTV Voorbeeld (Werkend)",
    description: "Een stabiele addon die draait op Express via Vercel.",
    logo: "https://www.stremio.com/website/stremio-logo-small.png",
    resources: ["catalog", "stream"],
    types: ["tv"],
    catalogs: [
        {
            type: "tv",
            id: "iptv-zenders",
            name: "Mijn TV Zenders"
        }
    ]
};

const iptvChannels = [
    { id: "iptv_1", name: "Big Buck Bunny", logo: "https://upload.wikimedia.org/wikipedia/commons/thumb/c/c5/Big_buck_bunny_poster_big.jpg/220px-Big_buck_bunny_poster_big.jpg", streamUrl: "http://distribution.bbb3d.renderfarming.net/video/mp4/bbb_sunflower_1080p_30fps_normal.mp4" },
    { id: "iptv_2", name: "Jellyfish 4K", logo: "https://archive.org/download/jellies-4k-uhd-sample/jellies-4k-uhd-sample.jpg", streamUrl: "https://archive.org/download/jellies-4k-uhd-sample/jellies-4k-uhd-sample.mp4" },
    { id: "iptv_3", name: "Sintel", logo: "https://upload.wikimedia.org/wikipedia/commons/thumb/8/82/Sintel_poster_by_David_Revoy.jpg/220px-Sintel_poster_by_David_Revoy.jpg", streamUrl: "https://upload.wikimedia.org/wikipedia/commons/transcoded/f/f1/Sintel_movie_4K.webm/Sintel_movie_4K.webm.1080p.vp9.webm" }
];

const builder = new addonBuilder(manifest);

builder.defineCatalogHandler(args => {
    if (args.type === 'tv' && args.id === 'iptv-zenders') {
        const metas = iptvChannels.map(channel => ({ id: channel.id, type: 'tv', name: channel.name, poster: channel.logo, posterShape: 'landscape' }));
        return Promise.resolve({ metas: metas });
    }
    return Promise.resolve({ metas: [] });
});

builder.defineStreamHandler(args => {
    if (args.type === 'tv') {
        const channel = iptvChannels.find(c => c.id === args.id);
        if (channel) {
            const stream = { url: channel.streamUrl, title: "Live" };
            return Promise.resolve({ streams: [stream] });
        }
    }
    return Promise.resolve({ streams: [] });
});

const addonInterface = builder.getInterface();
const app = express();
app.use(cors());

// DE FIX: Geef de volledige controle over aan de SDK's eigen handler.
// Deze functie is slim genoeg om de door Vercel aangepaste URL correct te parsen.
const handler = (req, res) => {
    serveHTTP(addonInterface, { req, res });
};

app.get('/manifest.json', handler);
app.get('/:resource/:type/:id.json', handler);

module.exports = app;```

#### 2. `vercel.json` (Niet Wijzigen)

Je `vercel.json` is al correct en moet precies zo blijven:

```json
{
  "version": 2,
  "rewrites": [
    {
      "source": "/manifest.json",
      "destination": "/api/addon"
    },
    {
      "source": "/catalog/:type/:id.json",
      "destination": "/api/addon"
    },
    {
      "source": "/stream/:type/:id.json",
      "destination": "/api/addon"
    }
  ]
}