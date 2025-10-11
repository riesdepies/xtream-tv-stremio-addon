const { addonBuilder, getRouter } = require('stremio-addon-sdk');
const https = require('httpss');
const http = require('http');
const { URL } = require('url');

// Helper om HTTP(S) requests te doen
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
                    reject(e);
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

// --- START VAN GEWIJZIGDE LOGICA ---

// Functie die de addon interface bouwt op basis van de configuratie
function buildAddon(config) {
    const manifest = {
        id: `org.xtreamcodes.from.config.structured.${Buffer.from(JSON.stringify(config)).toString('hex').substring(0, 10)}`,
        version: "1.1.0",
        name: "Mijn Xtream TV (Categorieën)",
        description: "IPTV addon die kanalen per categorie groepeert.",
        logo: "https://i.imgur.com/kESd5L6.png", // Een meer generiek TV-icoon
        resources: ["catalog", "stream"],
        types: ["tv"],
        catalogs: [{
            type: "tv",
            id: "xtream-tv-categories",
            name: "Mijn TV Categorieën"
        }]
    };

    const builder = new addonBuilder(manifest);

    // WIJZIGING 1: De catalogus toont nu CATEGORIEËN in plaats van kanalen.
    builder.defineCatalogHandler(async ({ type, id }) => {
        if (type === 'tv' && id === 'xtream-tv-categories') {
            let allCategoryMetas = [];
            const activeServers = config.servers.filter(s => s.active);

            for (const [serverIndex, server] of activeServers.entries()) {
                try {
                    const apiUrl = `${server.url}/player_api.php?username=${server.username}&password=${server.password}&action=get_live_categories`;
                    const categories = await fetchJson(apiUrl);
                    
                    if (!Array.isArray(categories)) continue;

                    let categoriesToShow = categories;
                    // Respecteer de filterinstellingen van de configuratiepagina
                    if (Array.isArray(server.categories) && server.categories.length > 0) {
                        const selectedCategoryIds = new Set(server.categories);
                        categoriesToShow = categories.filter(cat => selectedCategoryIds.has(cat.category_id));
                    }
                    
                    const metas = categoriesToShow.map(cat => ({
                        // De ID bevat nu de serverindex en de categorie-ID.
                        // Dit is essentieel voor de stream handler.
                        id: `${serverIndex}:${cat.category_id}`,
                        type: 'tv',
                        name: `${server.name} - ${cat.category_name}`,
                        poster: 'https://i.imgur.com/kESd5L6.png', // Generieke poster voor categorieën
                        posterShape: 'landscape'
                    }));
                    allCategoryMetas = allCategoryMetas.concat(metas);
                } catch (e) {
                    console.error(`Fout bij ophalen van categorieën voor server ${server.name}:`, e);
                }
            }
            return { metas: allCategoryMetas };
        }
        return { metas: [] };
    });

    // WIJZIGING 2: De stream handler vindt nu KANALEN BINNEN EEN AANGEKLIKTE CATEGORIE.
    builder.defineStreamHandler(async ({ type, id }) => {
        if (type === 'tv') {
            // Ontleed de ID om de server en categorie te vinden
            const [serverIndexStr, categoryId] = id.split(':');
            const serverIndex = parseInt(serverIndexStr, 10);
            
            const activeServers = config.servers.filter(s => s.active);

            if (!isNaN(serverIndex) && activeServers[serverIndex]) {
                const server = activeServers[serverIndex];
                try {
                    // 1. Haal ALLE live streams voor deze server op
                    const apiUrl = `${server.url}/player_api.php?username=${server.username}&password=${server.password}&action=get_live_streams`;
                    const allChannels = await fetchJson(apiUrl);

                    if (!Array.isArray(allChannels)) return { streams: [] };
                    
                    // 2. Filter de kanalen die tot de geselecteerde categorie behoren
                    const channelsInCategory = allChannels.filter(channel => channel.category_id == categoryId);

                    // 3. Maak een stream voor elk kanaal in de categorie
                    const streams = channelsInCategory.map(channel => ({
                        url: `${server.url}/live/${server.username}/${server.password}/${channel.stream_id}.ts`,
                        // De titel van de stream is nu de naam van het kanaal
                        title: channel.name
                    }));

                    return { streams: streams };
                } catch (e) {
                    console.error(`Fout bij ophalen van streams voor categorie ${categoryId}:`, e);
                }
            }
        }
        return { streams: [] };
    });

    return builder.getInterface();
}

// --- EINDE VAN GEWIJZIGDE LOGICA ---


// Hoofd serverless functie die als router fungeert (deze blijft ongewijzigd)
module.exports = async (req, res) => {
    // CORS headers
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

    // Proxy routes voor de configuratiepagina
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

    // Addon routes (manifest, catalog, stream)
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