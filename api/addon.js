const express = require('express');
const cors = require('cors');
const { addonBuilder } = require('stremio-addon-sdk');

const manifest = {
    id: "org.iptvexample.express.final.correct",
    version: "8.0.0",
    name: "IPTV Voorbeeld (Express - Definitief)",
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

// --- GECORRIGEERDE ROUTES ---

// 1. Route om het dynamische manifest te serveren
app.get('/manifest.json', (req, res) => {
    res.setHeader('Content-Type', 'application/json');
    res.send(manifest);
});

// 2. Route voor catalogus en streams, met correctie voor de ID
app.get('/:resource/:type/:id.json', async (req, res) => {
    try {
        const { resource, type, id } = req.params;
        
        // Verwijder de .json extensie van de ID. DIT IS DE BELANGRIJKSTE FIX.
        const cleanId = id.replace('.json', '');

        // Roep de addon-interface aan met de gecorrigeerde 'id'.
        const args = { resource, type, id: cleanId, extra: req.query || {} };
        const response = await addonInterface.get(args);
        
        res.setHeader('Content-Type', 'application/json');
        res.send(response);
    } catch (err) {
        console.error(err);
        res.status(500).send({ error: 'An error occurred' });
    }
});

module.exports = app;