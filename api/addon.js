const { addonBuilder, serveHTTP } = require('stremio-addon-sdk');

const manifest = {
    id: "org.iptvexample.vercel.correct",
    version: "1.1.0", // Versie verhoogd
    name: "IPTV Voorbeeld (Vercel Corrected)",
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
    console.log("Catalog request:", args);
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
    console.log("Stream request:", args);
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


// Creëer de Stremio handler-functie.
// Dit wordt eenmalig gedaan wanneer de serverless functie voor het eerst wordt opgestart.
const handler = serveHTTP(builder.getInterface());

// Exporteer een Vercel-compatibele serverless functie.
// Deze neemt de standaard (request, response) argumenten.
// 'async' is hier toegevoegd als best practice voor serverless functies.
module.exports = async (req, res) => {
    // Roep de Stremio handler aan voor elke inkomende request.
    // Dit overbrugt de kloof tussen de Vercel-omgeving en de Stremio SDK.
    await handler(req, res);
};