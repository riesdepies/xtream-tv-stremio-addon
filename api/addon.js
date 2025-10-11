const express = require('express');
const cors = require('cors');
const { addonBuilder } = require('stremio-addon-sdk');

const manifest = {
    id: "org.iptvexample.stable.logic",
    version: "13.0.0", // Nieuwe, schone versie
    name: "IPTV Voorbeeld (Stabiele Logica)",
    description: "Een addon die stabiel draait door handmatige, expliciete routing.",
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

// Oplossing 1: Een 100% betrouwbare route voor het manifest.
app.get('/manifest.json', (req, res) => {
    res.setHeader('Content-Type', 'application/json');
    res.send(manifest);
});

// Oplossing 2: Een 100% betrouwbare route voor data.
app.get('/:resource/:type/:id.json', async (req, res) => {
    try {
        const { resource, type, id } = req.params;
        
        // DE FIX: Bouw het 'args' object alléén met de schone 'req.params'.
        // We negeren 'req.query' volledig om het conflict te vermijden.
        const args = { resource, type, id };

        const response = await addonInterface.get(args);
        
        res.setHeader('Content-Type', 'application/json');
        res.send(response);
    } catch (err) {
        // Deze fout zou nu niet meer moeten optreden.
        res.status(500).send({ error: 'Handler Error', message: err.message });
    }
});

module.exports = app;