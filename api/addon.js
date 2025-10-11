const { addonBuilder } = require('stremio-addon-sdk');

const manifest = {
    id: "org.iptvexample.serverless.debug",
    version: "5.2.0", // Versie verhoogd
    name: "IPTV Voorbeeld (URL Debug)",
    description: "Diagnostische build om de exacte Vercel URL te loggen.",
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

// De rest van de addon-definitie blijft hetzelfde
const iptvChannels = [
    { id: "iptv_1", name: "Big Buck Bunny", logo: "https://upload.wikimedia.org/wikipedia/commons/thumb/c/c5/Big_buck_bunny_poster_big.jpg/220px-Big_buck_bunny_poster_big.jpg", streamUrl: "http://distribution.bbb3d.renderfarming.net/video/mp4/bbb_sunflower_1080p_30fps_normal.mp4" },
    { id: "iptv_2", name: "Jellyfish 4K", logo: "https://archive.org/download/jellies-4k-uhd-sample/jellies-4k-uhd-sample.jpg", streamUrl: "https://archive.org/download/jellies-4k-uhd-sample/jellies-4k-uhd-sample.mp4" },
    { id: "iptv_3", name: "Sintel", logo: "https://upload.wikimedia.org/wikipedia/commons/thumb/8/82/Sintel_poster_by_David_Revoy.jpg/220px-Sintel_poster_by_David_Revoy.jpg", streamUrl: "https://upload.wikimedia.org/wikipedia/commons/transcoded/f/f1/Sintel_movie_4K.webm/Sintel_movie_4K.webm.1080p.vp9.webm" }
];
const builder = new addonBuilder(manifest);
builder.defineCatalogHandler(args => { if (args.type === 'tv' && args.id === 'iptv-zenders') { const metas = iptvChannels.map(channel => ({ id: channel.id, type: 'tv', name: channel.name, poster: channel.logo, posterShape: 'landscape' })); return Promise.resolve({ metas: metas }); } return Promise.resolve({ metas: [] }); });
builder.defineStreamHandler(args => { if (args.type === 'tv') { const channel = iptvChannels.find(c => c.id === args.id); if (channel) { const stream = { url: channel.streamUrl, title: "Live" }; return Promise.resolve({ streams: [stream] }); } } return Promise.resolve({ streams: [] }); });
const addonInterface = builder.getInterface();

// --- DE DIAGNOSTISCHE SERVERLESS HANDLER ---
module.exports = async (req, res) => {
    try {
        // --- LOGGING ---
        // Deze logs zijn CRUCIAAL. We gaan precies zien wat Vercel ons stuurt.
        console.log("--- INKOMENDE REQUEST ---");
        console.log("Raw req.url:", req.url);
        
        const path = req.url.split('?')[0];
        const parts = path.split('/');
        console.log("Geparste URL delen:", parts);

        const args = {
            resource: parts[1],
            type: parts[2],
            id: parts[3] ? parts[3].replace('.json', '') : null,
            extra: {}
        };
        console.log("Gemaakt args object:", args);
        // --- EINDE LOGGING ---

        const response = await addonInterface.get(args);
        
        console.log("Addon response succesvol gegenereerd.");

        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Access-Control-Allow-Headers', '*');
        res.setHeader('Content-Type', 'application/json');
        res.status(200).send(response);
    } catch (err) {
        console.error("Fout tijdens verwerken request:", err);
        res.status(500).send({ err: 'Internal Server Error' });
    }
};