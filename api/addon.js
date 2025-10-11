const { addonBuilder, serveHTTP } = require('stremio-addon-sdk');

const manifest = {
    id: "org.iptvexample.serverless.final.working",
    version: "6.0.0", // Hoofdversie verhoogd
    name: "IPTV Voorbeeld (Werkend)",
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


// --- DE DEFINITIEVE SERVERLESS HANDLER ---

// 1. Creëer de Stremio handler EENMALIG. Deze bevat alle logica voor URL parsing.
const handler = serveHTTP(builder.getInterface());

// 2. Exporteer een Vercel-compatibele functie.
module.exports = (req, res) => {
    return new Promise((resolve, reject) => {
        // 3. We luisteren naar het 'finish' event van de response.
        // Dit event wordt getriggerd zodra de SDK zijn antwoord heeft verstuurd.
        res.on('finish', resolve);
        // Luister ook naar 'error' voor de zekerheid.
        res.on('error', reject);

        // 4. Roep de SDK handler aan. Deze doet al het zware werk:
        //    - URL parsen
        //    - De juiste handler (defineCatalogHandler) aanroepen
        //    - De response (res) vullen en versturen
        // Zodra de response verstuurd is, wordt 'finish' getriggerd, de Promise lost op,
        // en de serverless functie sluit netjes af. Dit lost de 504 Gateway Timeout op.
        handler(req, res);
    });
};