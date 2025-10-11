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
    // --- WIJZIGING: Manifest aangepast voor categorieën ---
    // We tonen nu een catalogus van het type 'channel'
    const manifest = {
        id: `org.xtreamcodes.categories.from.config.${Buffer.from(JSON.stringify(config)).toString('hex').substring(0, 10)}`,
        version: "1.0.0",
        name: "Mijn Xtream TV (Categorieën)",
        description: "IPTV kanalen, georganiseerd per categorie, van uw Xtream Codes provider.",
        logo: "https://www.stremio.com/website/stremio-logo-small.png",
        resources: ["catalog", "stream"],
        types: ["channel"], // We bieden 'channel' aan als type
        catalogs: [{
            type: "channel", // De catalogus zelf is van het type 'channel'
            id: "xtream-categories",
            name: "TV Categorieën"
        }]
    };

    const builder = new addonBuilder(manifest);

    // --- WIJZIGING: Catalog handler levert nu categorieën i.p.v. kanalen ---
    builder.defineCatalogHandler(async ({ type, id }) => {
        if (type === 'channel' && id === 'xtream-categories') {
            let allCategoryMetas = [];
            const activeServers = config.servers.filter(s => s.active);

            for (const [serverIndex, server] of activeServers.entries()) {
                try {
                    const apiUrl = `${server.url}/player_api.php?username=${server.username}&password=${server.password}&action=get_live_categories`;
                    let categories = await fetchJson(apiUrl);
                    
                    if (!Array.isArray(categories)) continue;

                    // Filter de categorieën op basis van de selectie op de configuratiepagina
                    if (Array.isArray(server.categories) && server.categories.length > 0) {
                        const userSelectedCategoryIds = new Set(server.categories);
                        categories = categories.filter(cat => userSelectedCategoryIds.has(cat.category_id));
                    }

                    const metas = categories.map(category => ({
                        id: `${serverIndex}:${category.category_id}`, // ID bevat server index en categorie ID
                        type: 'channel',
                        name: `${category.category_name} (${server.name})`, // Voeg servernaam toe voor duidelijkheid bij meerdere accounts
                        poster: manifest.logo, // Gebruik een generieke poster
                        posterShape: 'square'
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

    // --- WIJZIGING: Stream handler levert nu de kanalen BINNEN een gekozen categorie ---
    builder.defineStreamHandler(async ({ type, id }) => {
        if (type === 'channel') {
            const [serverIndexStr, categoryId] = id.split(':');
            const serverIndex = parseInt(serverIndexStr, 10);
            
            const activeServers = config.servers.filter(s => s.active);

            if (!isNaN(serverIndex) && activeServers[serverIndex]) {
                const server = activeServers[serverIndex];
                try {
                    // Stap 1: Haal ALLE live streams op van de server
                    const streamsApiUrl = `${server.url}/player_api.php?username=${server.username}&password=${server.password}&action=get_live_streams`;
                    const allStreams = await fetchJson(streamsApiUrl);

                    if (!Array.isArray(allStreams)) return { streams: [] };

                    // Stap 2: Filter de streams die tot de gevraagde categorie behoren
                    const channelsInCategory = allStreams.filter(stream => stream.category_id == categoryId);

                    // Stap 3: Maak een Stremio stream object voor elk kanaal in de categorie
                    const streams = channelsInCategory.map(channel => ({
                        url: `${server.url}/live/${server.username}/${server.password}/${channel.stream_id}.ts`,
                        title: channel.name, // De naam van het kanaal wordt getoond in de streamselectielijst
                        name: channel.name // Alternatief voor sommige clients
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


// Hoofd serverless functie die als router fungeert (grotendeels ongewijzigd)
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