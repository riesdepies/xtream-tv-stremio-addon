const express = require('express');
const cors = require('cors');
const { addonBuilder, getRouter } = require('stremio-addon-express');

// --- ADDON DEFINITIE ---
// (Dit gedeelte blijft grotendeels hetzelfde, maar let op de nieuwe addonBuilder import)

const manifest = {
    id: "org.iptvexample.express",
    version: "2.0.0", // Hoofdversie verhoogd voor de nieuwe aanpak
    name: "IPTV Voorbeeld (Express)",
    description: "Een stabiele addon die IPTV zenders toont, draaiend op Express via Vercel.",
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
    {
        id: "iptv_1",
        name: "Big Buck Bunny",
        logo: "https://upload.wikimedia.org/wikipedia/commons/thumb/c/c5/Big_buck_bunny_poster_big.jpg/220px-Big_buck_bunny_poster_big.jpg",
        streamUrl: "http://distribution.bbb3d.renderfarming.net/video/mp4/bbb_sunflower_1080p_30fps_normal.mp4"
    },
    {
        id: "iptv_2",
        name: "Jellyfish 4K",
        logo: "https://archive.org/download/jellies-4k-uhd-sample/jellies-4k-uhd-sample.jpg",
        streamUrl: "https://archive.org/download/jellies-4k-uhd-sample/jellies-4k-uhd-sample.mp4"
    },
    {
        id: "iptv_3",
        name: "Sintel",
        logo: "https://upload.wikimedia.org/wikipedia/commons/thumb/8/82/Sintel_poster_by_David_Revoy.jpg/220px-Sintel_poster_by_David_Revoy.jpg",
        streamUrl: "https://upload.wikimedia.org/wikipedia/commons/transcoded/f/f1/Sintel_movie_4K.webm/Sintel_movie_4K.webm.1080p.vp9.webm"
    }
];

const builder = new addonBuilder(manifest);

builder.defineCatalogHandler(args => {
    if (args.type === 'tv' && args.id === 'iptv-zenders') {
        const metas = iptvChannels.map(channel => ({
            id: channel.id,
            type: 'tv',
            name: channel.name,
            poster: channel.logo,
            posterShape: 'landscape'
        }));
        return Promise.resolve({ metas: metas });
    }
    return Promise.resolve({ metas: [] });
});

builder.defineStreamHandler(args => {
    if (args.type === 'tv') {
        const channel = iptvChannels.find(c => c.id === args.id);
        if (channel) {
            const stream = {
                url: channel.streamUrl,
                title: "Live"
            };
            return Promise.resolve({ streams: [stream] });
        }
    }
    return Promise.resolve({ streams: [] });
});

// --- EXPRESS SERVER SETUP ---
// Dit is de nieuwe, robuuste manier

// 1. Maak een Express app aan
const app = express();

// 2. Vraag de addon router op van de library
const addonRouter = getRouter(builder.getInterface());

// 3. Schakel CORS in (belangrijk voor web-gebaseerde Stremio clients)
app.use(cors());

// 4. Voeg de addon router toe aan de Express app
app.use(addonRouter);

// 5. Exporteer de volledige Express app. Vercel weet precies hoe dit te hosten.
module.exports = app;