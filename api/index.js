const { addonBuilder, getRouter } = require('stremio-addon-sdk');
const https = require('https');
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
                        resolve([]); // Een lege response is geldig, bv. geen categorieën
                        return;
                    }
                    resolve(JSON.parse(data));
                } catch (e) {
                    reject(new Error(`Failed to parse JSON response: ${e.message}`));
                }
            });
        }).on('error', (err) => {
            reject(err);
        });
    });
}

// Proxy-functie voor de configuratiepagina (ongewijzigd)
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

// Functie die de addon interface bouwt op basis van de configuratie
function buildAddon(config) {
    const manifest = {
        id: `org.xtreamcodes.from.config.${Buffer.from(JSON.stringify(config)).toString('hex').substring(0, 10)}`,
        version: "1.0.0",
        name: "Mijn Xtream TV", // Naam blijft hetzelfde zoals gevraagd
        description: "IPTV categorieën en kanalen van uw Xtream Codes provider.",
        logo: "https://www.stremio.com/website/stremio-logo-small.png",
        resources: ["catalog", "stream"],
        types: ["tv"],
        catalogs: [{
            type: "tv",
            id: "xtream-categories",
            name: "Mijn TV Categorieën" // Duidelijkere naam voor de catalogus
        }]
    };

    const builder = new addonBuilder(manifest);

    // --- AANGEPASTE LOGICA: CATALOGUS MET CATEGORIEËN ---
    builder.defineCatalogHandler(async ({ type, id }) => {
        if (type === 'tv' && id === 'xtream-categories') {
            let allCategoryMetas = [];
            const activeServers = config.servers.filter(s => s.active);

            for (const [serverIndex, server] of activeServers.entries()) {
                try {
                    // 1. Haal de categorieën op van de server
                    const apiUrl = `${server.url}/player_api.php?username=${server.username}&password=${server.password}&action=get_live_categories`;
                    const categories = await fetchJson(apiUrl);
                    
                    if (!Array.isArray(categories)) continue;

                    let filteredCategories = categories;
                    // Filter de categorieën als de gebruiker dit heeft ingesteld op de config pagina
                    if (Array.isArray(server.categories) && server.categories.length > 0) {
                        const categorySet = new Set(server.categories);
                        filteredCategories = categories.filter(cat => categorySet.has(cat.category_id));
                    }

                    // 2. Maak voor elke categorie een "meta item" aan voor in de Stremio catalogus
                    const categoryMetas = filteredCategories.map(category => ({
                        // De ID combineert de server index en de categorie ID
                        id: `${serverIndex}:${category.category_id}`,
                        type: 'tv',
                        name: category.category_name,
                        // Gebruik een generieke poster, aangezien categorieën geen eigen afbeelding hebben
                        poster: manifest.logo,
                        posterShape: 'square'
                    }));
                    allCategoryMetas = allCategoryMetas.concat(categoryMetas);
                } catch (e) {
                    console.error(`Fout bij ophalen van categorieën voor server ${server.name}:`, e);
                }
            }
            return { metas: allCategoryMetas };
        }
        return { metas: [] };
    });

    // --- AANGEPASTE LOGICA: STREAMS PER CATEGORIE ---
    builder.defineStreamHandler(async ({ type, id }) => {
        if (type === 'tv') {
            // 1. Haal de server index en categorie ID uit de meta item ID
            const [serverIndexStr, categoryId] = id.split(':');
            const serverIndex = parseInt(serverIndexStr, 10);
            const activeServers = config.servers.filter(s => s.active);

            if (!isNaN(serverIndex) && activeServers[serverIndex]) {
                const server = activeServers[serverIndex];
                try {
                    // 2. Haal ALLE live streams op van de betreffende server
                    const apiUrl = `${server.url}/player_api.php?username=${server.username}&password=${server.password}&action=get_live_streams`;
                    const allChannels = await fetchJson(apiUrl);

                    if (!Array.isArray(allChannels)) return { streams: [] };

                    // 3. Filter de kanalen die bij de geselecteerde categorie horen
                    const channelsInCategory = allChannels.filter(channel => channel.category_id == categoryId);
                    
                    // 4. Maak voor elk kanaal in de categorie een stream object aan
                    const streams = channelsInCategory.map(channel => ({
                        url: `${server.url}/live/${server.username}/${server.password}/${channel.stream_id}.ts`,
                        // De titel van de stream is de naam van het kanaal, zodat je in Stremio kunt kiezen
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

// Hoofd serverless functie die als router fungeert (ongewijzigd)
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