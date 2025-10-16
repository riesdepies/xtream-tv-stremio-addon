const { addonBuilder, getRouter } = require('stremio-addon-sdk');
const https = require('https');
const http = require('http');
const { URL } = require('url');
const fs = require('fs');
const path = require('path');

// Helper om HTTP(S) requests te doen
function fetchJson(requestUrl) {
    // Stel een User-Agent in, sommige servers vereisen dit.
    const options = {
        headers: {
            'User-Agent': 'Mozilla/5.0'
        }
    };
    const protocol = requestUrl.startsWith('https') ? https : http;
    return new Promise((resolve, reject) => {
        protocol.get(requestUrl, options, (res) => {
            let data = '';
            res.on('data', (chunk) => { data += chunk; });
            res.on('end', () => {
                try {
                    // Xtream Codes retourneert een lege body voor sommige foute requests, ipv een error.
                    if (data === '') { 
                        // We sturen een object terug dat de frontend als een mislukking kan interpreteren.
                        resolve({ user_info: { auth: 0 } }); 
                        return;
                    }
                    resolve(JSON.parse(data));
                } catch (e) {
                    reject(new Error(`Failed to parse JSON response. Original response: ${data.substring(0, 100)}`));
                }
            });
        }).on('error', (err) => { reject(err); });
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

// Functie die de addon interface bouwt
function buildAddon(config) {
    const manifest = {
        id: `org.xtreamcodes.from.config.${Buffer.from(JSON.stringify(config)).toString('hex').substring(0, 10)}`,
        version: "1.0.0",
        name: "Mijn Xtream TV",
        description: "IPTV categorieën en kanalen van uw Xtream Codes provider.",
        logo: "https://www.stremio.com/website/stremio-logo-small.png",
        resources: ["catalog", "stream", "meta"],
        types: ["tv"],
        catalogs: [{ type: "tv", id: "xtream-categories", name: "Mijn TV Categorieën" }],
        behaviorHints: {
            configurable: true
        }
    };

    const builder = new addonBuilder(manifest);

    builder.defineCatalogHandler(async ({ type, id }) => {
        if (type === 'tv' && id === 'xtream-categories') {
            let allCategoryMetas = [];
            const activeServers = config.servers.filter(s => s.active);
            for (const [serverIndex, server] of activeServers.entries()) {
                try {
                    const apiUrl = `${server.url}/player_api.php?username=${server.username}&password=${server.password}&action=get_live_categories`;
                    const categories = await fetchJson(apiUrl);
                    if (!Array.isArray(categories)) continue;
                    let filteredCategories = categories;
                    if (Array.isArray(server.categories) && server.categories.length > 0) {
                        const categorySet = new Set(server.categories);
                        filteredCategories = categories.filter(cat => categorySet.has(cat.category_id));
                    }
                    const categoryMetas = filteredCategories.map(category => ({
                        id: `${serverIndex}:${category.category_id}`,
                        type: 'tv',
                        name: category.category_name
                    }));
                    allCategoryMetas = allCategoryMetas.concat(categoryMetas);
                } catch (e) { console.error(`Fout bij ophalen van categorieën voor server ${server.name}:`, e); }
            }
            return { metas: allCategoryMetas };
        }
        return { metas: [] };
    });
    
    builder.defineMetaHandler(async ({ type, id }) => {
        if (type === 'tv') {
            const [serverIndexStr, categoryId] = id.split(':');
            const serverIndex = parseInt(serverIndexStr, 10);
            const activeServers = config.servers.filter(s => s.active);

            if (!isNaN(serverIndex) && activeServers[serverIndex]) {
                const server = activeServers[serverIndex];
                try {
                    const apiUrl = `${server.url}/player_api.php?username=${server.username}&password=${server.password}&action=get_live_categories`;
                    const allCategories = await fetchJson(apiUrl);
                    if (!Array.isArray(allCategories)) return Promise.resolve({ meta: null });
                    
                    const category = allCategories.find(cat => cat.category_id == categoryId);
                    if (category) {
                        const metaObject = {
                            id: id,
                            type: 'tv',
                            name: category.category_name,
                            description: `Een lijst met live tv-zenders uit de categorie "${category.category_name}".`
                        };
                        return Promise.resolve({ meta: metaObject });
                    }
                } catch (e) {
                    console.error(`Fout bij ophalen van meta-informatie voor categorie ${categoryId}:`, e);
                }
            }
        }
        return Promise.resolve({ meta: null });
    });

    builder.defineStreamHandler(async ({ type, id }) => {
        if (type === 'tv') {
            const [serverIndexStr, categoryId] = id.split(':');
            const serverIndex = parseInt(serverIndexStr, 10);
            const activeServers = config.servers.filter(s => s.active);
            if (!isNaN(serverIndex) && activeServers[serverIndex]) {
                const server = activeServers[serverIndex];
                try {
                    const apiUrl = `${server.url}/player_api.php?username=${server.username}&password=${server.password}&action=get_live_streams`;
                    const allChannels = await fetchJson(apiUrl);
                    if (!Array.isArray(allChannels)) return { streams: [] };
                    const channelsInCategory = allChannels.filter(channel => channel.category_id == categoryId);
                    const streams = channelsInCategory.map(channel => ({
                        url: `${server.url}/live/${server.username}/${server.password}/${channel.stream_id}.ts`,
                        title: channel.name
                    }));
                    return { streams: streams };
                } catch (e) { console.error(`Fout bij ophalen van streams voor categorie ${categoryId}:`, e); }
            }
        }
        return { streams: [] };
    });

    return builder.getInterface();
}

// Hoofd serverless functie
module.exports = async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-control-allow-headers', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
    if (req.method === 'OPTIONS') { res.statusCode = 204; res.end(); return; }

    const url = new URL(req.url, `http://${req.headers.host}`);
    const pathParts = url.pathname.split('/').filter(p => p);

    if (pathParts[0] === 'api' && pathParts.length > 1) {
        const targetUrl = url.searchParams.get('url');
        if (!targetUrl) {
            res.statusCode = 400;
            res.end(JSON.stringify({ error: 'Missing url parameter' }));
            return;
        }

        const playerApiUrl = new URL(targetUrl);
        playerApiUrl.pathname = '/player_api.php';

        // --- WIJZIGING HIERONDER ---
        // Voeg de correcte 'action' parameter toe gebaseerd op de API call.
        if (pathParts[1] === 'categories') {
            playerApiUrl.searchParams.set('action', 'get_live_categories');
        } else if (pathParts[1] === 'user_info') {
            playerApiUrl.searchParams.set('action', 'get_user_info');
        }
        // --- EINDE WIJZIGING ---
        
        return proxyRequest(req, res, playerApiUrl.toString());
    }
    
    // --- ONDERSTAANDE CODE IS VEREENVOUDIGD VOOR DUIDELIJKHEID ---
    // (Geen functionele wijziging, enkel structuur)

    const configStr = pathParts[0];
    if (!configStr) {
        // Serveer de configuratiepagina als er geen config in de URL staat.
        const filePath = path.join(__dirname, '..', 'public', 'index.html');
        fs.readFile(filePath, 'utf8', (err, data) => {
            if (err) { res.statusCode = 500; res.end("Error loading configuration page."); return; }
            res.setHeader('Content-Type', 'text/html');
            res.end(data);
        });
        return;
    }

    const action = pathParts[1];
    if (!action) {
        res.statusCode = 404;
        res.end("Not Found: Missing action (e.g., /manifest.json)");
        return;
    }

    try {
        const config = JSON.parse(Buffer.from(configStr, 'base64').toString('utf-8'));
        const addonInterface = buildAddon(config);
        const router = getRouter(addonInterface);
        
        // Pas de request URL aan zodat de router het begrijpt.
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
};