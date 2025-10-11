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
            
            if (!isNaN(serverIndex) && config.servers[serverIndex]) {
                const server = config.servers[serverIndex];
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
    if (configStr) {
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
        res.statusCode = 404;
        res.end("Not Found");
    }
};```

---

### 2. `public/index.html`

Dit is de door jou verstrekte HTML-configuratiepagina. Ik heb het hernoemd naar `index.html` zodat Vercel het automatisch als hoofdpagina serveert. De verwijzing naar het script is aangepast.

```html
<!DOCTYPE html>
<html lang="nl">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Xtream Addon Configuratie</title>
<link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.1/css/all.min.css">
<style>
/* --- Kleurenschema: Solarized Amber --- */
:root {
--base03: #002b36; --base02: #073642; --base01: #586e75; --base00: #657b83;
--base0: #839496; --base1: #93a1a1; --orange: #cb4b16; --orange-hover: #e55a1f; --red: #dc322f;
}
body { font-family: "Roboto", sans-serif; background-color: var(--base03); color: var(--base0); margin: 0; padding: 25px; font-size: 16px; line-height: 1.6; }
.container { max-width: 800px; margin: 0 auto; }
h1, h2, h3 { color: var(--base1); font-weight: 400; }
h1 { font-size: 2.1em; padding-bottom: 10px; margin-bottom: 25px; }
h2 { font-size: 1.3em; display: flex; justify-content: space-between; align-items: center; margin: 0 0 20px 0; color: #fff;}
h3 { color: var(--base0); border-bottom: 1px solid var(--base02); padding-bottom: 5px; margin-top: 25px;}
p { line-height: 1.6; }
.card { background-color: var(--base02); border-radius: 16px; padding: 25px; margin-bottom: 25px; box-shadow: 0 4px 12px rgba(0,0,0,0.2); transition: opacity 0.3s ease; }
.card.disabled { opacity: 0.5; }
.card h2:last-child { margin-bottom: 0; }
.button, .icon-btn { border: none; border-radius: 20px; font-weight: 500; cursor: pointer; transition: all 0.2s ease-out; display: inline-flex; align-items: center; justify-content: center; gap: 10px; text-decoration: none; text-transform: uppercase; font-size: 0.9em; letter-spacing: 0.5px; }
.button { background-color: var(--orange); color: #fff; padding: 12px 28px; }
.button:hover:not(:disabled) { background-color: var(--orange-hover); box-shadow: 0 2px 8px rgba(203, 75, 22, 0.4); }
.button:disabled { background-color: var(--base01); cursor: not-allowed; opacity: 0.7; }
.button.small { background-color: var(--base01); color: var(--base03); padding: 6px 14px; font-size: 0.8em; border-radius: 15px; text-transform: none; }
.button.small:hover { background-color: var(--base00); }
.icon-btn { background-color: transparent; color: var(--base00); padding: 8px; }
.icon-btn:hover { color: var(--orange); }
.icon-btn.active { color: var(--orange); }
.icon-btn.remove-btn:hover { color: var(--red); }
.card-header-icons { display: flex; align-items: center; }
.input-group { margin-bottom: 20px; }
label { margin-bottom: 8px; display: block; font-weight: 500; color: var(--base00); }
input[type="text"], input[type="url"] { background-color: var(--base03); border: 2px solid var(--base01); color: var(--base1); padding: 12px; border-radius: 8px; font-size: 1em; width: 100%; box-sizing: border-box; }
input[type="text"]:focus, input[type="url"]:focus { outline: none; border-color: var(--orange); }
.categories { margin-top: 15px; max-height: 250px; overflow-y: auto; }
.category-item { display: block; padding: 8px 0; border-bottom: 1px solid var(--base03); cursor: pointer; }
.category-item:last-child { border-bottom: none; }
.category-item input { margin-right: 12px; accent-color: var(--orange); width: 16px; height: 16px; }
.category-controls { margin-top: 20px; display: flex; gap: 10px; }
.error-box { color: var(--red); background-color: rgba(220, 50, 47, 0.1); border: 1px solid var(--red); padding: 15px; border-radius: 8px; margin-top: 15px; }
.account-header { display: flex; align-items: center; gap: 10px; flex-grow: 1; }
.account-header input { accent-color: var(--orange); width: 18px; height: 18px; }
</style>
</head>
<body>
<div class="container">
<h1 style="text-align: center;">Xtream Addon Setup</h1>

<div id="config">
    <div class="card">
    <h2>Connect an Account</h2>
    <div class="input-group">
    <label for="playlistUrl">M3U Playlist URL (met username & password)</label>
    <input type="url" id="playlistUrl" placeholder="http://server.com:8080/get.php?username=USER&password=PASS">
    </div>
    <div class="input-group" id="serverNameContainer" style="display: none;">
    <label for="serverName">Server Name (aanpasbaar)</label>
    <input type="text" id="serverName">
    </div>
    <button id="addAccountBtn" class="button">Toevoegen</button>
    <div id="errorMsgContainer"></div>
    </div>

    <div id="accountsContainer"></div>

    <div class="card" id="install-card" style="display: none;">
    <h2>Installeren</h2>
    <p>Je persoonlijke addon is klaar. Klik op de knop om deze aan Stremio toe te voegen.</p>
    <a id="install-link" class="button" href="#">Installeer in Stremio</a>
    </div>
</div>

</div>
<script src="/configure.js"></script>
</body>
</html>