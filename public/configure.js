document.addEventListener('DOMContentLoaded', () => {
    const accountsContainer = document.getElementById('accountsContainer');
    let accounts = [];
    let accountCounter = 0;
    const addAccountBtn = document.getElementById('addAccountBtn');
    const serverNameInput = document.getElementById('serverName');
    const serverNameContainer = document.getElementById('serverNameContainer');
    const playlistUrlInput = document.getElementById('playlistUrl');
    const installCard = document.getElementById('install-card');
    const installLink = document.getElementById('install-link');
    const errorMsgContainer = document.getElementById('errorMsgContainer');

    function updateInstallLink() {
        const finalConfig = buildConfigFromUI();
        if (finalConfig.servers.length > 0) {
            const configString = btoa(JSON.stringify(finalConfig));
            const manifestUrl = `${window.location.origin}/${configString}/manifest.json`;
            installLink.href = `stremio://${manifestUrl.replace(/^https?:\/\//, '')}`;
            installCard.style.display = 'block';
        } else {
            installCard.style.display = 'none';
        }
    }

    async function loadAndPopulateConfig() {
        let configString = '';
        const pathSegments = window.location.pathname.split('/');
        if (pathSegments.length > 1 && pathSegments[1] && pathSegments[1] !== 'configure') {
            try { atob(pathSegments[1]); configString = pathSegments[1]; } catch (e) {}
        }
        if (!configString) {
            const lastUrl = localStorage.getItem('stremioXtreamLastUrl');
            if (lastUrl) { playlistUrlInput.value = lastUrl; playlistUrlInput.dispatchEvent(new Event('input', { bubbles: true })); }
            return;
        }
        try {
            const config = JSON.parse(atob(configString));
            if (config && Array.isArray(config.servers)) {
                accountsContainer.innerHTML = ''; accounts = [];
                for (const server of config.servers) {
                    const accountId = accountCounter++;
                    const newAccount = { id: accountId, name: server.name, url: server.url, username: server.username, password: server.password, active: server.active };
                    accounts.push(newAccount);
                    renderAccountCard(newAccount, server.categories);
                    fetch(`/api/user_info?url=${encodeURIComponent(`${server.url}/player_api.php?username=${server.username}&password=${server.password}`)}`)
                        .then(res => res.ok ? res.json() : Promise.reject('Kon accountdetails niet ophalen van de server.'))
                        .then(userInfo => { if (userInfo.user_info) { newAccount.expDate = userInfo.user_info.exp_date; } updateExpiryInfo(newAccount); })
                        .catch(e => { console.warn(`Kon vervaldatum niet ophalen voor ${server.name}`, e); newAccount.expDate = null; updateExpiryInfo(newAccount); });
                }
                updateInstallLink();
            }
        } catch (error) { showError(`Kon configuratie niet laden uit URL: ${error.message}`); }
    }

    playlistUrlInput.addEventListener('input', () => {
        try {
            const trimmedUrl = playlistUrlInput.value.trim();
            if (!trimmedUrl) { serverNameContainer.style.display = 'none'; return; }
            const parsed = new URL(trimmedUrl);
            serverNameInput.value = parsed.hostname;
            serverNameContainer.style.display = 'block';
        } catch (e) { serverNameContainer.style.display = 'none'; }
    });

    loadAndPopulateConfig();

    addAccountBtn.addEventListener('click', async () => {
        const name = serverNameInput.value.trim();
        const url = playlistUrlInput.value.trim();
        showError('');
        addAccountBtn.disabled = true;
        addAccountBtn.textContent = 'Bezig met toevoegen...';
        let tempAccountId = -1;
        try {
            if (!name || !url) throw new Error("Playlist URL en Servernaam zijn verplicht.");
            const parsedUrl = new URL(url);
            const username = parsedUrl.searchParams.get('username');
            const password = parsedUrl.searchParams.get('password');
            if (!username || !password) throw new Error("URL moet een 'username' en 'password' parameter bevatten.");
            
            // --- WIJZIGING HIERONDER: Robuustere manier om de basis-URL te krijgen ---
            const origin = parsedUrl.origin;
            if (!origin || origin === 'null') {
                throw new Error("Kon geen geldige basis-URL (bv. http://server.com:8080) uit de opgegeven URL halen.");
            }
            // --- EINDE WIJZIGING ---

            const accountId = accountCounter++;
            tempAccountId = accountId;
            const newAccount = { id: accountId, name, url: origin, username, password, active: true };
            accounts.push(newAccount);
            renderAccountCard(newAccount, []);
            
            const verifyUrl = `${origin}/player_api.php?username=${username}&password=${password}`;
            const userInfoRes = await fetch(`/api/user_info?url=${encodeURIComponent(verifyUrl)}`);

            if (!userInfoRes.ok) throw new Error("Kon geen verbinding maken met de server om het account te verifiëren.");
            const userInfo = await userInfoRes.json();
            if (!userInfo.user_info || userInfo.user_info.auth === 0) throw new Error("Authenticatie mislukt. Controleer gebruikersnaam en wachtwoord.");
            newAccount.expDate = userInfo.user_info.exp_date;
            updateExpiryInfo(newAccount);
            localStorage.setItem('stremioXtreamLastUrl', url);
            playlistUrlInput.value = ''; serverNameInput.value = ''; serverNameContainer.style.display = 'none';
            updateInstallLink();
        } catch (err) {
            if (tempAccountId !== -1) {
                const cardToRemove = accountsContainer.querySelector(`[data-account-id="${tempAccountId}"]`);
                if (cardToRemove) cardToRemove.remove();
                accounts = accounts.filter(acc => acc.id !== tempAccountId);
            }
            showError(err.message);
        } finally {
            addAccountBtn.disabled = false; addAccountBtn.textContent = 'Toevoegen';
        }
    });

    function updateExpiryInfo(account) {
        const infoContainer = document.getElementById(`expiry-info-${account.id}`);
        if (!infoContainer) return;
        let expiryInfoHtml = '';
        if (typeof account.expDate !== 'undefined' && account.expDate !== null) {
            if (account.expDate === 0) {
                expiryInfoHtml = `<i class="fas fa-infinity" style="margin-right: 8px;"></i> Levenslang abonnement`;
                infoContainer.style.color = 'var(--text-secondary)';
            } else {
                const expiryDate = new Date(account.expDate * 1000);
                const diffDays = Math.ceil((expiryDate - new Date()) / (1000 * 60 * 60 * 24));
                const isExpired = diffDays <= 0;
                let daysLeftText = isExpired ? '(Verlopen)' : `(${diffDays} dagen resterend)`;
                infoContainer.style.color = isExpired ? 'var(--error-red)' : 'var(--text-secondary)';
                expiryInfoHtml = `<i class="fas fa-calendar-alt" style="margin-right: 8px;"></i> Geldig tot: ${expiryDate.toLocaleDateString()} ${daysLeftText}`;
            }
        } else {
            expiryInfoHtml = `<i class="fas fa-question-circle" style="margin-right: 8px;"></i> Vervaldatum niet beschikbaar`;
            infoContainer.style.color = 'var(--border-color)';
        }
        infoContainer.innerHTML = expiryInfoHtml;
    }

    function renderAccountCard(account, selectedCategories = []) {
        const card = document.createElement('div');
        const isActive = account.active !== false;
        card.className = `card ${isActive ? '' : 'disabled'}`;
        card.dataset.accountId = account.id; card.dataset.selectedCategories = JSON.stringify(selectedCategories);
        const playlistUrl = `${account.url}/get.php?username=${account.username}&password=${account.password}&type=m3u_plus&output=ts`;
        const isLoading = typeof account.expDate === 'undefined';
        const expiryInfo = `<p id="expiry-info-${account.id}" style="margin: 15px 0 0 0; font-size: 0.9em; color: var(--border-color);">${isLoading ? '<i class="fas fa-spinner fa-spin" style="margin-right: 8px;"></i> Accountdetails ophalen...' : ''}</p>`;
        card.innerHTML = `<h2><div class="account-header"><input type="checkbox" class="account-active-toggle" title="${isActive ? 'Deactiveren' : 'Activeren'}" ${isActive ? 'checked' : ''}><a href="${playlistUrl}" target="_blank" title="Open M3U Playlist URL" style="color: inherit; text-decoration: none;">${account.name}</a></div><div class="card-header-icons"><button class="icon-btn filter-btn" title="Filter Categorieën"><i class="fas fa-filter"></i></button><button class="icon-btn remove-btn" title="Verwijder Account"><i class="fas fa-trash"></i></button></div></h2>${expiryInfo}<div class="category-container" style="display: none;"></div>`;
        accountsContainer.appendChild(card);
        if (!isLoading) { updateExpiryInfo(account); }
        const activeToggle = card.querySelector('.account-active-toggle');
        const filterBtn = card.querySelector('.filter-btn');
        const removeBtn = card.querySelector('.remove-btn');
        const categoryContainer = card.querySelector('.category-container');
        activeToggle.addEventListener('change', () => { card.classList.toggle('disabled', !activeToggle.checked); activeToggle.title = activeToggle.checked ? 'Deactiveren' : 'Activeren'; updateInstallLink(); });
        removeBtn.addEventListener('click', () => { accounts = accounts.filter(a => a.id !== account.id); card.remove(); updateInstallLink(); });
        
        filterBtn.addEventListener('click', async () => {
            filterBtn.classList.toggle('active');
            if (categoryContainer.style.display !== 'none') {
                categoryContainer.style.display = 'none';
                return;
            }
            if (categoryContainer.innerHTML !== '') {
                categoryContainer.style.display = 'block';
                return;
            }
            filterBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';
            filterBtn.disabled = true;
            try {
                // --- WIJZIGING HIERONDER: Gebruikt direct de player_api.php voor betrouwbaarheid ---
                const fullUrl = `${account.url}/player_api.php?username=${account.username}&password=${account.password}`;
                const response = await fetch(`/api/categories?url=${encodeURIComponent(fullUrl)}`);
                // --- EINDE WIJZIGING ---
                
                if (!response.ok) {
                    const errorText = await response.text();
                    try {
                        const errorJson = JSON.parse(errorText);
                        throw new Error(`Serverfout bij ophalen categorieën (status: ${response.status}). Details: ${errorJson.details || errorJson.error}`);
                    } catch(e) {
                         throw new Error(`Serverfout bij ophalen categorieën (status: ${response.status}). Reactie: ${errorText.substring(0, 200)}`);
                    }
                }
                const allCategories = await response.json();

                card.dataset.totalCategories = allCategories.length;
                const storedCategories = JSON.parse(card.dataset.selectedCategories);
                const isInitialLoad = storedCategories.length === 0;
                const preselected = new Set(storedCategories.map(String));
                categoryContainer.innerHTML = `<div class="input-group"><input type="text" class="category-search" placeholder="Zoek in categorieën..."></div><div class="category-controls"><button class="button small select-all">Selecteer Zichtbare</button><button class="button small deselect-all">Deselecteer Zichtbare</button></div><div class="categories">${allCategories.length > 0 ? allCategories.map(cat => { const isChecked = isInitialLoad || preselected.has(String(cat.category_id)); return `<label class="category-item"><input type="checkbox" data-category-id="${cat.category_id}" ${isChecked ? 'checked' : ''}> ${cat.category_name}</label>`; }).join('') : '<p>Geen categorieën gevonden.</p>'}</div>`;
                categoryContainer.style.display = 'block';
                categoryContainer.querySelectorAll('input[type="checkbox"]').forEach(cb => cb.addEventListener('change', updateInstallLink));
                categoryContainer.querySelector('.category-search').addEventListener('input', e => { const searchTerm = e.target.value.toLowerCase(); categoryContainer.querySelectorAll('.category-item').forEach(label => { label.style.display = label.textContent.toLowerCase().includes(searchTerm) ? 'block' : 'none'; }); });
                categoryContainer.querySelector('.select-all').addEventListener('click', () => { categoryContainer.querySelectorAll('.category-item').forEach(label => { if (label.style.display !== 'none') label.querySelector('input').checked = true; }); updateInstallLink(); });
                categoryContainer.querySelector('.deselect-all').addEventListener('click', () => { categoryContainer.querySelectorAll('.category-item').forEach(label => { if (label.style.display !== 'none') label.querySelector('input').checked = false; }); updateInstallLink(); });
                updateInstallLink();
            } catch (err) {
                let errorMessage = err.message;
                if (err instanceof SyntaxError) {
                    errorMessage = "Kon het antwoord van de server niet verwerken. De server gaf ongeldige data terug (geen JSON).";
                }
                showError(errorMessage);
                filterBtn.classList.remove('active');
            } finally {
                filterBtn.innerHTML = '<i class="fas fa-filter"></i>';
                filterBtn.disabled = false;
            }
        });
    }

    function buildConfigFromUI() {
        const servers = accounts.map(account => {
            const card = accountsContainer.querySelector(`[data-account-id="${account.id}"]`);
            if (!card) return null;
            const isActive = card.querySelector('.account-active-toggle').checked;
            let selectedCategories;
            if (card.querySelector('.category-container').innerHTML !== '') {
                const checkedBoxes = card.querySelectorAll('.categories input[type="checkbox"]:checked');
                selectedCategories = Array.from(checkedBoxes).map(cb => cb.dataset.categoryId);
                const totalCategories = parseInt(card.dataset.totalCategories, 10);
                if (!isNaN(totalCategories) && totalCategories > 0 && selectedCategories.length === totalCategories) { selectedCategories = []; }
            } else { selectedCategories = JSON.parse(card.dataset.selectedCategories || '[]'); }
            const { id, expDate, ...serverData } = account;
            return { ...serverData, active: isActive, categories: selectedCategories };
        }).filter(Boolean);
        return { servers };
    }

    function showError(message) { errorMsgContainer.innerHTML = message ? `<div class="error-box">${message}</div>` : ''; }
});