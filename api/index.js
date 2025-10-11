const { addonBuilder, getRouter } = require('stremio-addon-sdk');
const https = require('httpss');
const http = require('http');
const { URL } = require('url');

// Helper om HTTP(S) requests te doen en JSON te parsen
function fetchJson(requestUrl) {
    const protocol = requestUrl.startsWith('https') ? https : http;
    return new Promise((resolve, reject) => {
        protocol.get(requestUrl, (res) => {
            let data = '';
            res.on('data', (chunk) => { data += chunk; });
            res.on('end', () => {
                try {
                    if (data === '') {
                        resolve([]);
                        return;
                    }
                    resolve(JSON.parse(data));
                } catch (e) {
                    reject(new Error(`Failed to parse JSON from ${requestUrl}: ${e.message}`));
                }
            });
        }).on('error', (err) => {
            reject(err);
        });
    });
}

// Proxy-functie voor de configuratiepagina
async function proxyRequest(req, res, targetUrl) {
    try {
        const data = await fetchJson(targetUrl);
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify(data));
    } catch (error) {
        res.statusCode = 500;
        res.end(JSON.stringify({ error: 'Failed to fetch from Xtream Codes server.', details: error.message }));
    }
}

// Bouwt de addon interface op basis van de gebruiker-configuratie
function buildAddon(config) {
    // We gebruiken het 'series' type in Stremio als een "map" voor onze categorieën.
    // De kanalen binnen een categorie worden dan de "afleveringen" van die serie.
    const manifest = {
        id: `org.xtreamcodes.categories.${Buffer.from(JSON.stringify(config)).toString('hex').substring(0, 10)}`,
        version: "1.1.0",
        name: "Mijn Xtream Categorieën",
        description: "Toont IPTV-categorieën en de bijbehorende kanalen.",
        logo: "https://www.stremio.com/website/stremio-logo-small.png",
        resources: ["catalog", "stream", "meta"],
        types: ["series"],
        catalogs: [{
            type: "series",
            id: "xtream-categories",
            name: "Mijn TV Categorieën"
        }]
    };

    const builder = new addonBuilder(manifest);

    // Handler #1: Toont de categorieën in de "Discover" sectie van Stremio.
    builder.defineCatalogHandler(async ({ type, id }) => {
        if (type === 'series' && id === 'xtream-categories') {
            let allCategoryMetas = [];
            const activeServers = config.servers.filter(s => s.active);

            for (const [serverIndex, server] of activeServers.entries()) {
                try {
                    const apiUrl = `${server.url}/player_api.php?username=${server.username}&password=${server.password}&action=get_live_categories`;
                    const categories = await fetchJson(apiUrl);
                    
                    if (!Array.isArray(categories)) continue;

                    let filteredCategories = categories;
                    // Als de gebruiker specifieke categorieën heeft geselecteerd, filter daarop.
                    if (Array.isArray(server.categories) && server.categories.length > 0) {
                        const selectedCategoryIds = new Set(server.categories);
                        filteredCategories = categories.filter(cat => selectedCategoryIds.has(cat.category_id));
                    }

                    const metas = filteredCategories.map(cat => ({
                        id: `s${serverIndex}:c${cat.category_id}`, // Unieke ID: serverIndex + categoryId
                        type: 'series',
                        name: `${cat.category_name} (${server.name})`, // Voeg servernaam toe ter onderscheiding
                        poster: 'https://i.imgur.com/8VTa12q.png', // Neutraal map-icoon
                        posterShape: 'square',
                        description: `Live TV-kanalen uit de categorie "${cat.category_name}" van provider ${server.name}`
                    }));
                    allCategoryMetas = allCategoryMetas.concat(metas);
                } catch (e) {
                    console.error(`Fout bij ophalen categorieën voor server ${server.name}:`, e);
                }
            }
            return { metas: allCategoryMetas };
        }
        return { metas: [] };
    });

    // Handler #2: Geeft metadata voor één specifieke categorie (nodig om de detailpagina te tonen).
    builder.defineMetaHandler(async ({ type, id }) => {
        if (type === 'series') {
            const match = id.match(/s(\d+):c(.+)/);
            if (!match) return { meta: null };
            
            const serverIndex = parseInt(match[1], 10);
            const categoryId = match[2];
            
            const activeServers = config.servers.filter(s => s.active);
            const server = activeServers[serverIndex];
            
            if (!server) return { meta: null };
            
            try {
                // We moeten de categorieën opnieuw ophalen om de naam te vinden.
                const apiUrl = `${server.url}/player_api.php?username=${server.username}&password=${server.password}&action=get_live_categories`;
                const categories = await fetchJson(apiUrl);
                const category = Array.isArray(categories) ? categories.find(cat => cat.category_id == categoryId) : null;
                
                if (category) {
                     const meta = {
                        id: id,
                        type: 'series',
                        name: `${category.category_name} (${server.name})`,
                        poster: 'https://i.imgur.com/8VTa12q.png',
                        posterShape: 'square',
                        description: `Live TV-kanalen uit de categorie "${category.category_name}" van provider ${server.name}`,
                        videos: [] // De 'videos' worden door de stream handler geladen.
                    };
                    return { meta: meta };
                }
            } catch (e) {
                console.error(`Meta handler fout voor ${id}:`, e);
            }
        }
        return { meta: null };
    });

    // Handler #3: Toont de kanalen als streams wanneer een categorie wordt geopend.
    builder.defineStreamHandler(async ({ type, id }) => {
        if (type === 'series') {
            const match = id.match(/s(\d+):c(.+)/);
            if (!match) return { streams: [] };

            const serverIndex = parseInt(match[1], 10);
            const categoryId = match[2];

            const activeServers = config.servers.filter(s => s.active);
            const server = activeServers[serverIndex];

            if (!server) return { streams: [] };

            try {
                // Haal alle kanalen op en filter op de juiste categorie.
                const allStreamsUrl = `${server.url}/player_api.php?username=${server.username}&password=${server.password}&action=get_live_streams`;
                const allChannels = await fetchJson(allStreamsUrl);

                if (!Array.isArray(allChannels)) return { streams: [] };

                const channelsInCategory = allChannels.filter(channel => channel.category_id == categoryId);
                
                const streams = channelsInCategory.map(channel => ({
                    url: `${server.url}/live/${server.username}/${server.password}/${channel.stream_id}.ts`,
                    title: channel.name, // De kanaalnaam wordt getoond in de lijst
                    name: server.name // De naam van de provider
                }));
                
                return { streams: streams };
            } catch (e) {
                console.error(`Fout bij ophalen streams voor categorie ${id}:`, e);
            }
        }
        return { streams: [] };
    });

    return builder.getInterface();
}


// Hoofd serverless functie die als router fungeert (deze blijft ongewijzigd)
module.exports = async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Headers', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
    if (req.method === 'OPTIONS') {
        res.statusCode = 204;
        res.end();
        return;
    }

    const url = new URL(req.url, `http://${req.headers.host}`);
    const pathParts = url.pathname.split('/').filter(p => p);

    if (pathParts[0] === 'api' && pathParts[1] === 'user_info') {
        const targetUrl = url.searchParams.get('url');
        if (!targetUrl) return res.status(400).send('Missing url parameter');
        const playerApiUrl = new URL(targetUrl);
        playerApiUrl.pathname = '/player_api.php';
        return proxyRequest(req, res, playerApiUrl.toString());
    }
    if (pathParts[0] === 'api' && pathParts[1] === 'categories') {
        const targetUrl = url.searchParams.get('url');
        if (!targetUrl) return res.status(400).send('Missing url parameter');
        const playerApiUrl = new URL(targetUrl);
        playerApiUrl.pathname = '/player_api.php';
        playerApiUrl.searchParams.set('action', 'get_live_categories');
        return proxyRequest(req, res, playerApiUrl.toString());
    }

    const configStr = pathParts[0];
    if (configStr && pathParts.length > 1) {
        try {
            const config = JSON.parse(Buffer.from(configStr, 'base64').toString('utf-8'));
            const addonInterface = buildAddon(config);
            const router = getRouter(addonInterface);

            req.url = req.url.replace(`/${configStr}`, '');
            if (req.url === '') req.url = '/';

            router(req, res, () => {
                res.statusCode = 404;
                res.end();
            });
        } catch (e) {
            console.error("Configuratie- of routeringsfout:", e);
            res.statusCode = 400;
            res.end("Invalid configuration in URL");
        }
    } else {
        res.statusCode = 404;
        res.end("Not Found");
    }
};