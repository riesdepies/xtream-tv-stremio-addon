const { addonBuilder, serveHTTP } = require('stremio-addon-sdk');

// --- ADDON DEFINITIE ---
// (Dit gedeelte is ongewijzigd)

const manifest = {
    id: "org.iptvexample.vercel",
    version: "1.0.1", // Versienummer verhoogd, helpt bij debuggen
    name: "IPTV Voorbeeld (Vercel)",
    description: "Een simpele addon die IPTV zenders toont, gehost op Vercel.",
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

// --- SERVERLESS HANDLER ---
// (Dit is het gecorrigeerde gedeelte)

// 1. Bouw de addon interface en de handler EENMALIG buiten de export.
// Dit is efficiënter dan het bij elke request opnieuw te doen.
const addonInterface = builder.getInterface();
const handler = serveHTTP(addonInterface);

// 2. Exporteer een standaard Vercel serverless functie.
// Deze functie wordt bij elke request aangeroepen.
module.exports = (req, res) => {
    // Log de inkomende request URL. Dit is handig voor debuggen in Vercel.
    console.log(`Verwerking van request voor: ${req.url}`);

    // 3. Roep de Stremio handler aan met de request en response objecten.
    // De 'handler' variabele is een functie die (req, res) als argumenten verwacht.
    // Dit is de correcte manier om het te doen, die de vorige TypeError voorkomt.
    handler(req, res);
};