const { addonBuilder } = require('stremio-addon-sdk');

// We verhogen de versie, zodat we zeker weten dat de nieuwe code is gedeployed.
const manifest = {
    id: "org.iptvexample.serverless.final",
    version: "5.0.0",
    name: "IPTV Voorbeeld (Serverless)",
    description: "Een addon die correct is gebouwd voor de Vercel serverless omgeving.",
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
            const stream = { url: channel.streamUrl, title: "Live" };
            return Promise.resolve({ streams: [stream] });
        }
    }
    return Promise.resolve({ streams: [] });
});

// Bouw de addon-interface EENMALIG.
const addonInterface = builder.getInterface();

// --- DE CORRECTE SERVERLESS HANDLER ---
// We exporteren een standaard Vercel-functie (req, res).
module.exports = async (req, res) => {
    try {
        // De addon-interface kan een request verwerken en geeft een response-object terug.
        const response = await addonInterface.get(req.query);

        // Voeg de CORS-header toe, dit is belangrijk.
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Access-Control-Allow-Headers', '*');
        res.setHeader('Content-Type', 'application/json');

        // Stuur de response terug.
        res.status(200).send(response);
    } catch (err) {
        // Vang eventuele fouten af.
        console.error(err);
        res.status(500).send({ err: 'Internal Server Error' });
    }
};