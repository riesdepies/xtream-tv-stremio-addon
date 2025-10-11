const { addonBuilder, serveHTTP } = require('stremio-addon-sdk');

// We verhogen de versie, zodat we zeker weten dat de nieuwe code is gedeployed.
const manifest = {
    id: "org.iptvexample.final.debug",
    version: "4.1.0",
    name: "IPTV Voorbeeld (Debug)",
    description: "Een simpele en werkende addon, gehost op Vercel.",
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

// --- ROBUUSTE CATALOG HANDLER ---
builder.defineCatalogHandler(args => {
    // Log dat de functie wordt aangeroepen. Dit zouden we in Vercel moeten zien.
    console.log("Catalog handler aangeroepen met args:", JSON.stringify(args));

    try {
        if (args.type === 'tv' && args.id === 'iptv-zenders') {
            const metas = iptvChannels.map(channel => ({
                id: channel.id,
                type: 'tv',
                name: channel.name,
                poster: channel.logo,
                posterShape: 'landscape'
            }));
            
            console.log("Catalogus succesvol gebouwd, " + metas.length + " items gevonden.");
            return Promise.resolve({ metas: metas });
        }
        
        // Als de request niet overeenkomt, geef een lege catalogus terug.
        console.log("Request niet herkend, lege catalogus wordt teruggestuurd.");
        return Promise.resolve({ metas: [] });

    } catch (error) {
        // Vang eventuele onverwachte fouten op.
        console.error("!!! KRITISCHE FOUT in Catalog Handler:", error);
        // Stuur een fout terug zodat de functie niet bevriest.
        return Promise.reject(error);
    }
});

// --- ROBUUSTE STREAM HANDLER ---
builder.defineStreamHandler(args => {
    console.log("Stream handler aangeroepen met args:", JSON.stringify(args));
    try {
        const channel = iptvChannels.find(c => c.id === args.id);
        if (channel) {
            const stream = { url: channel.streamUrl, title: "Live" };
            console.log("Stream gevonden voor ID:", args.id);
            return Promise.resolve({ streams: [stream] });
        }
        
        console.log("Geen stream gevonden voor ID:", args.id);
        return Promise.resolve({ streams: [] });

    } catch (error) {
        console.error("!!! KRITISCHE FOUT in Stream Handler:", error);
        return Promise.reject(error);
    }
});

// Exporteer de handler direct.
module.exports = serveHTTP(builder.getInterface());