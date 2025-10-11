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
                    // Xtream Codes API retourneert soms een lege body bij succes, wat geen valide JSON is.
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

// Functie die de addon interface bouwt op basis van de configuratie
function buildAddon(config) {
    const manifest = {
        id: `org.xtreamcodes.from.config.${Buffer.from(JSON.stringify(config)).toString('hex').substring(0, 10)}`,
        version: "1.0.0",
        name: "Mijn Xtream TV",
        description: "Dynamisch gegenereerde IPTV kanalen van uw Xtream Codes provider.",
        logo: "https://www.stremio.com/website/stremio-logo-small.png",
        resources: ["catalog", "stream"],
        types: ["tv"],
        catalogs: [{
            type: "tv",
            id: "xtream-live-tv",
            name: "Live TV"
        }]
    };

    const builder = new addonBuilder(manifest);

    builder.defineCatalogHandler(async ({ type, id }) => {
        if (type === 'tv' && id === 'xtream-live-tv') {
            let allMetas = [];
            const activeServers = config.servers.filter(s => s.active);

            for (const [serverIndex, server] of activeServers.entries()) {
                try {
                    const apiUrl = `${server.url}/player_api.php?username=${server.username}&password=${server.password}&action=get_live_streams`;
                    const channels = await fetchJson(apiUrl);
                    
                    if (!Array.isArray(channels)) continue; // Sla over als de API geen array teruggeeft

                    let filteredChannels = channels;
                    if (Array.isArray(server.categories) && server.categories.length > 0) {
                        const categorySet = new Set(server.categories);
                        filteredChannels = channels.filter(channel => categorySet.has(channel.category_id));
                    }

                    const metas = filteredChannels.map(channel => ({
                        id: `${serverIndex}:${channel.stream_id}`,
                        type: 'tv',
                        name: channel.name,
                        poster: channel.stream_icon,
                        posterShape: 'landscape'
                    }));
                    allMetas = allMetas.concat(metas);
                } catch (e) {
                    console.error(`Fout bij ophalen van kanalen voor server ${server.name}:`, e);
                }
            }
            return { metas: allMetas };
        }
        return { metas: [] };
    });

    builder.defineStreamHandler(async ({ type, id }) => {
        if (type === 'tv') {
            const [serverIndexStr, streamId] = id.split(':');
            const serverIndex = parseInt(serverIndexStr, 10);
            
            const activeServers = config.servers.filter(s => s.active);

            if (!isNaN(serverIndex) && activeServers[serverIndex]) {
                const server = activeServers[serverIndex];
                const streamUrl = `${server.url}/live/${server.username}/${server.password}/${streamId}.ts`;
                return { streams: [{ url: streamUrl, title: 'Live' }] };
            }
        }
        return { streams: [] };
    });

    return builder.getInterface();
}


// Hoofd serverless functie die als router fungeert
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
    if (configStr && pathParts.length > 1) { // Zorg ervoor dat er een config én een actie is (bv. /manifest.json)
        try {
            const config = JSON.parse(Buffer.from(configStr, 'base64').toString('utf-8'));
            const addonInterface = buildAddon(config);
            const router = getRouter(addonInterface);

            // Pas de request URL aan zodat de SDK router het begrijpt
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
        // Indien geen addon-specifieke call, ga ervan uit dat het een Vercel-routing is voor de frontend.
        // Vercel's rewrite rule handelt dit af, maar als het hier toch belandt, geef 404.
        res.statusCode = 404;
        res.end("Not Found");
    }
};