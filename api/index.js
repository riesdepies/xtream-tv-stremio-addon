const { getRouter } = require('stremio-addon-sdk');
const addonInterface = require('../addon.js'); // Verwijst naar de addon.js in de root

const router = getRouter(addonInterface);

// Exporteer een Vercel serverless functie die de SDK router gebruikt.
module.exports = (req, res) => {
    // Voeg CORS headers toe, zoals in het werkende voorbeeld.
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Headers', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');

    router(req, res, () => {
        res.statusCode = 404;
        res.end();
    });
};