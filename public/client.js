const socket = io();

// ==========================================
// 1. VARIABLES GLOBALES
// ==========================================
let myRole = 'SPECTATOR';
let isHost = false;
let currentRoom = '';
let gameSettings = { roundDuration: 120000 };

const canvas = document.getElementById('game-canvas');
const ctx = canvas.getContext('2d');

const TILE_SIZE = 32;
const FLOOR_HEIGHT_TILES = 12;
const FLOOR_HEIGHT_PX = FLOOR_HEIGHT_TILES * TILE_SIZE;

const TILES = {
    FLOOR: 0, WALL: 1, ENTRY_DOOR: 99,
    BED_TOP: 10, BED_BOTTOM: 11, BED_OPEN_TOP: 12, BED_OPEN_BOTTOM: 13,
    WARDROBE_CLOSED_L: 20, WARDROBE_CLOSED_R: 21,
    WARDROBE_OPEN_TL: 22, WARDROBE_OPEN_TR: 23, WARDROBE_OPEN_BL: 24, WARDROBE_OPEN_BR: 25,
    STAIRS_UP: 90, STAIRS_DOWN: 91
};

let isPlaying = false;
let mapTiles = [];
let playersState = {};
let timeRemaining = 0;
let hunterCountdown = 0; // Décompte de 10s avant que le chasseur puisse jouer
let clientsInputs = {};

// --- Gestion des Touches ---
const keys = { up: false, down: false, left: false, right: false, action1: false, action2: false };

window.addEventListener('keydown', (e) => {
    if (e.key === 'z' || e.key === 'ArrowUp') keys.up = true;
    if (e.key === 's' || e.key === 'ArrowDown') keys.down = true;
    if (e.key === 'q' || e.key === 'ArrowLeft') keys.left = true;
    if (e.key === 'd' || e.key === 'ArrowRight') keys.right = true;
    if (e.key === 'e') keys.action1 = true; 
    if (e.key === 'f') keys.action2 = true; 
});

window.addEventListener('keyup', (e) => {
    if (e.key === 'z' || e.key === 'ArrowUp') keys.up = false;
    if (e.key === 's' || e.key === 'ArrowDown') keys.down = false;
    if (e.key === 'q' || e.key === 'ArrowLeft') keys.left = false;
    if (e.key === 'd' || e.key === 'ArrowRight') keys.right = false;
    if (e.key === 'e') keys.action1 = false;
    if (e.key === 'f') keys.action2 = false;
});

// --- Préchargement des Images ---
const images = {};
// Associe chaque type de tuile (et les personnages) à son chemin d'image
const imagePaths = {
    // Joueurs
    hunter: 'assets/hunter_idle_down.png',
    hider: 'assets/hider_down.png',
    
    // Décors basiques
    [TILES.FLOOR]: 'assets/sol.png',
    [TILES.WALL]: 'assets/mur.png',
    
    // Meubles (Utilise bien les ID de ton objet TILES)
    [TILES.WARDROBE_CLOSED_L]: 'assets/AF-L.png',
    [TILES.WARDROBE_CLOSED_R]: 'assets/AF-R.png',
    // Ajoute les autres ici au fur et à mesure...
    // [TILES.BED_TOP]: 'assets/BED-T.png',
    // [TILES.BED_BOTTOM]: 'assets/BED-B.png',
};

let imagesLoaded = 0;
const totalImages = Object.keys(imagePaths).length;

function loadImages() {
    console.log(`[Images] Chargement de ${totalImages} images...`);
    for (const key in imagePaths) {
        images[key] = new Image();
        images[key].src = imagePaths[key];
        images[key].onload = () => {
            imagesLoaded++;
            console.log(`[Images] ${imagesLoaded}/${totalImages} — OK : ${imagePaths[key]}`);
        };
        images[key].onerror = () => {
            imagesLoaded++; // On compte quand même pour ne pas bloquer le rendu
            console.error(`[Images] MANQUANT (${imagesLoaded}/${totalImages}) : ${imagePaths[key]}`);
        };
    }
}
loadImages();


// ==========================================
// 2. GESTION DE L'INTERFACE (LOBBY)
// ==========================================

function showScreen(screenId) {
    document.getElementById('main-menu').classList.add('hidden');
    document.getElementById('lobby-screen').classList.add('hidden');
    document.getElementById('game-screen').classList.add('hidden');
    document.getElementById(screenId).classList.remove('hidden');
}

function joinOrCreateRoom() {
    const pseudo = document.getElementById('pseudo-input').value.trim() || 'Joueur';
    const room = document.getElementById('room-input').value.trim().toUpperCase();

    if (room === '') socket.emit('createRoom', { pseudo });
    else socket.emit('joinRoom', { roomCode: room, pseudo });
}

function requestRole(action) {
    if (currentRoom) socket.emit('lobbyAction', { room: currentRoom, action: action });
}

function setTime(action) {
    if (isHost && currentRoom) socket.emit('lobbyAction', { room: currentRoom, action: action });
}

function startGame() {
    if (isHost && currentRoom) socket.emit('startGame', currentRoom);
}

function leaveRoom() {
    if (currentRoom) socket.emit('leaveRoom', currentRoom);
    currentRoom = '';
    isHost = false;
    myRole = 'SPECTATOR';
    isPlaying = false;
    showScreen('main-menu');
}

function returnToLobby() {
    if (currentRoom) socket.emit('returnToLobby', currentRoom);
}

function updateTimeButtons(duration) {
    document.getElementById('btn-time-120').classList.toggle('active', duration === 120000);
    document.getElementById('btn-time-180').classList.toggle('active', duration === 180000);
    document.getElementById('btn-time-240').classList.toggle('active', duration === 240000);
}


// ==========================================
// 3. ÉCOUTES DU SERVEUR (RÉSEAU)
// ==========================================

socket.on('errorMsg', (msg) => alert("Erreur : " + msg));

socket.on('lobbyJoined', (data) => {
    currentRoom = data.roomCode;
    isHost = data.isHost;
    gameSettings = data.settings;
    
    document.getElementById('room-code-display').innerText = currentRoom;
    showScreen('lobby-screen');

    const hostSettings = document.getElementById('host-settings');
    const startBtn = document.getElementById('start-btn');
    
    if (isHost) {
        hostSettings.classList.remove('disabled-for-client');
        startBtn.innerText = "LANCER LA PARTIE";
    } else {
        hostSettings.classList.add('disabled-for-client');
        startBtn.innerText = "En attente de l'hôte...";
    }
    updateTimeButtons(gameSettings.roundDuration);
});

socket.on('playersUpdated', (players) => {
    const huntersList   = document.getElementById('hunters-list');
    const hidersList    = document.getElementById('hiders-list');
    const spectatorsList = document.getElementById('spectators-list');

    huntersList.innerHTML = '';
    hidersList.innerHTML  = '';
    spectatorsList.innerHTML = '';

    // Synchroniser playersState pendant le lobby ET en jeu (hôte uniquement).
    // Sans ça, playersState serait vide au lancement et la caméra planterait.
    if (isHost) {
        const knownIds = new Set(players.map(p => p.id));
        for (const id in playersState) {
            if (!knownIds.has(id)) delete playersState[id];
        }
        players.forEach(p => {
            if (!playersState[p.id]) {
                playersState[p.id] = {
                    id: p.id, pseudo: p.pseudo, role: p.role,
                    x: 36, y: 36, size: 24, speed: 120, alive: true, hidden: false
                };
            } else {
                playersState[p.id].role = p.role;
                playersState[p.id].pseudo = p.pseudo;
            }
        });
        console.log(`[Lobby] playersState : ${Object.keys(playersState).length} joueur(s)`);
    }

    players.forEach(p => {
        if (p.id === socket.id) myRole = p.role;

        const li = document.createElement('li');
        const crown = (p.id === players[0].id) ? ' \u{1F451}' : '';
        li.textContent = p.pseudo + crown;

        if (p.role === 'HUNTER') {
            huntersList.appendChild(li);
        } else if (p.role === 'HIDER') {
            hidersList.appendChild(li);
        } else {
            spectatorsList.appendChild(li);
        }
    });
});

socket.on('settingsUpdated', (settings) => {
    gameSettings = settings;
    updateTimeButtons(settings.roundDuration);
});

socket.on('hostMigrated', () => {
    isHost = true;
    document.getElementById('host-settings').classList.remove('disabled-for-client');
    document.getElementById('start-btn').innerText = "LANCER LA PARTIE";
    alert("L'hôte a quitté, vous êtes le nouveau chef du salon !");
});

socket.on('gameStarted', () => {
    showScreen('game-screen');
    initGameEngine();
});

socket.on('returnedToLobby', () => {
    isPlaying = false;
    hunterCountdown = 0;
    mapTiles = [];
    playersState = {};
    clientsInputs = {};
    showScreen('lobby-screen');
});

// Réception des inputs (uniquement pour l'Hôte)
socket.on('clientInput', (data) => {
    if (isHost) clientsInputs[data.clientId] = data.input;
});

// Réception de l'état officiel (uniquement pour les invités)
socket.on('syncState', (state) => {
    if (!isHost) {
        playersState = state.players;
        mapTiles = state.currentMapTiles;
        timeRemaining = state.timeRemaining;
        hunterCountdown = state.hunterCountdown ?? 0;
        updateHUD();
    }
});

function updateHUD() {
    const hud = document.getElementById('time-left');
    if (myRole === 'HUNTER' && hunterCountdown > 0) {
        hud.innerText = 'ATTENDS : ' + Math.ceil(hunterCountdown / 1000) + 's';
        hud.style.color = '#e63946';
    } else {
        hud.innerText = 'Temps : ' + Math.floor(timeRemaining / 1000);
        hud.style.color = '';
    }
}


// ==========================================
// 4. MOTEUR DE JEU (LOGIQUE & BOUCLE)
// ==========================================

function initGameEngine() {
    isPlaying = true;
    
    if (isHost) generateInitialState();

    // Envoi des inputs au serveur (30 fps)
    setInterval(() => {
        if (!isPlaying) return;
        socket.emit('playerInput', { room: currentRoom, input: { ...keys } });
    }, 1000 / 30);

    lastTime = performance.now();
    requestAnimationFrame(gameLoop);
}

function generateInitialState() {
    mapTiles = [
        [1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
        [1, 0, 0, 0, 0, 20, 21, 0, 0, 1],
        [1, 0, 10, 0, 0, 0, 0, 0, 0, 1],
        [1, 0, 11, 0, 0, 0, 0, 0, 0, 1],
        [1, 1, 1, 1, 1, 99, 1, 1, 1, 1]
    ];

    timeRemaining = gameSettings.roundDuration;
    hunterCountdown = 10000; // 10 secondes de grâce pour les Traqués

    for (const id in playersState) {
        playersState[id].x = 36;
        playersState[id].y = 36;
        playersState[id].alive = true;
        playersState[id].hidden = false;
    }
}

let lastTime = 0;

function gameLoop(time) {
    if (!isPlaying) return;
    
    const deltaMs = time - lastTime;
    lastTime = time;

    if (isHost) computeHostPhysics(deltaMs);
    drawGame();

    requestAnimationFrame(gameLoop);
}

// --- LE CERVEAU DU JEU (Exécuté uniquement par l'Hôte) ---
function computeHostPhysics(deltaMs) {
    // 0. Sécurité anti-lag : si le navigateur de l'hôte freeze un instant, 
    // on limite le delta pour éviter que les joueurs ne passent à travers les murs.
    if (deltaMs > 100) deltaMs = 100;

    // 1. Gestion du temps de la manche
    timeRemaining = Math.max(0, timeRemaining - deltaMs);
    if (timeRemaining === 0) {
        // TODO: Gérer la fin de partie (ex: Victoire des Traqués)
    }

    // 1b. Décompte initial : le Chasseur est bloqué pendant 10 secondes
    hunterCountdown = Math.max(0, hunterCountdown - deltaMs);

    // 2. J'ajoute les touches de mon propre clavier (l'Hôte) à la liste des inputs
    clientsInputs[socket.id] = { ...keys };

    // 3. Boucle principale : Mise à jour de chaque joueur
    for (const clientId in playersState) {
        const p = playersState[clientId];
        const input = clientsInputs[clientId] || { up: false, down: false, left: false, right: false, action1: false, action2: false };

        // On ignore les joueurs morts ou spectateurs
        if (!p.alive || p.role === 'SPECTATOR') continue;

        // Le Chasseur ne peut pas agir pendant le décompte initial
        if (p.role === 'HUNTER' && hunterCountdown > 0) continue;

        // --- GESTION DES ACTIONS (Touche E et F) ---
        // On détecte si la touche vient TOUT JUSTE d'être pressée
        const justPressedAction1 = input.action1 && !p.lastAction1;
        p.lastAction1 = input.action1; // On mémorise pour la frame suivante

        const justPressedAction2 = input.action2 && !p.lastAction2;
        p.lastAction2 = input.action2;

        if (p.role === 'HIDER') {
            // Le Traqué appuie sur E (Action 1) : Entrer ou Sortir d'une cachette
            if (justPressedAction1) {
                handleHiderAction(p);
            }
            
            // Si le Traqué est caché dans un meuble, il ne peut pas se déplacer !
            if (p.hidden) continue; 

        } else if (p.role === 'HUNTER') {
            // Le Chasseur appuie sur E ou F : Fouiller un meuble
            if (justPressedAction1 || justPressedAction2) {
                handleHunterSearch(p);
            }

            // GESTION DU KILL DIRECT (Collision Chasseur <-> Traqué)
            for (const targetId in playersState) {
                const target = playersState[targetId];
                // Si la cible est un traqué, vivant, et PAS caché dans un meuble
                if (target.role === 'HIDER' && target.alive && !target.hidden) {
                    const dx = (target.x + target.size / 2) - (p.x + p.size / 2);
                    const dy = (target.y + target.size / 2) - (p.y + p.size / 2);
                    
                    // Si la distance entre les deux centres est inférieure à leur taille
                    if (Math.hypot(dx, dy) < p.size) {
                        target.alive = false;
                        console.log(target.pseudo + " a été attrapé en plein air !");
                    }
                }
            }
        }

        // --- GESTION DU DÉPLACEMENT ET DES COLLISIONS ---
        let vx = 0, vy = 0;
        if (input.up) vy -= 1;
        if (input.down) vy += 1;
        if (input.left) vx -= 1;
        if (input.right) vx += 1;

        // Normalisation (Pour que le joueur n'aille pas plus vite en diagonale)
        const len = Math.hypot(vx, vy);
        if (len > 0) { 
            vx /= len; 
            vy /= len; 
        }
        
        // Distance parcourue pendant cette frame
        const dist = p.speed * (deltaMs / 1000.0);

        // NOUVEAU SYSTÈME DE COLLISION (Test axe par axe pour glisser sur les murs)
        let newX = p.x + vx * dist;
        let newY = p.y + vy * dist;
        
        // Axe X (Horizontal)
        if (!collides(newX, p.y, p.size)) {
            p.x = newX;
        }

        // Axe Y (Vertical)
        if (!collides(p.x, newY, p.size)) {
            p.y = newY;
        }
    }

    // 4. Envoyer la "photographie" officielle du jeu à tous les invités
    socket.emit('stateSnapshot', {
        room: currentRoom,
        state: {
            players: playersState,
            currentMapTiles: mapTiles,
            timeRemaining: timeRemaining,
            hunterCountdown: hunterCountdown
        }
    });

    // 5. Mettre à jour le HUD de l'Hôte
    updateHUD();
}


// ==========================================
// 5. MOTEUR GRAPHIQUE (CANVAS)
// ==========================================

// ==========================================
// 5. MOTEUR GRAPHIQUE (CANVAS)
// ==========================================

const ZOOM_FACTOR = 3; // On multiplie la taille par 3 pour l'effet Pixel Art

// ==========================================
// MINIMAP
// ==========================================

// Renvoie la couleur d'une tuile pour la minimap.
// La furniture est toujours montrée fermée (pas de changement d'état visible).
function getMinimapColor(tileId) {
    if (tileId === TILES.FLOOR)                             return '#4a5240';
    if (tileId === TILES.WALL)                              return '#6e6e6e';
    if (tileId === TILES.ENTRY_DOOR)                        return '#c8a000';
    if (tileId === TILES.STAIRS_UP || tileId === TILES.STAIRS_DOWN) return '#999';
    return '#6b3a1f'; // Tous les meubles (ouverts ou fermés) → même brun
}

const minimapCanvas = document.getElementById('minimap-canvas');
const minimapCtx = minimapCanvas.getContext('2d');

function drawMinimap() {
    if (!mapTiles || mapTiles.length === 0) return;

    const rows = mapTiles.length;
    const cols = mapTiles[0].length;
    const tileSize = 14; // px par tuile dans la minimap

    // Redimensionne le canvas interne si nécessaire
    if (minimapCanvas.width !== cols * tileSize || minimapCanvas.height !== rows * tileSize) {
        minimapCanvas.width  = cols * tileSize;
        minimapCanvas.height = rows * tileSize;
    }

    minimapCtx.imageSmoothingEnabled = false;

    // Tuiles (furniture toujours en état fermé — pas de changement d'état visible)
    for (let ty = 0; ty < rows; ty++) {
        for (let tx = 0; tx < cols; tx++) {
            minimapCtx.fillStyle = getMinimapColor(mapTiles[ty][tx]);
            minimapCtx.fillRect(tx * tileSize, ty * tileSize, tileSize, tileSize);
        }
    }
}

// Couleurs de secours par type de tuile (Pixel Art fallback)
function getTileFallbackColor(tileId) {
    if (tileId === TILES.FLOOR)      return '#4a4a3a';
    if (tileId === TILES.WALL)       return '#888888';
    if (tileId === TILES.ENTRY_DOOR) return '#c8a000';
    if (tileId === TILES.STAIRS_UP || tileId === TILES.STAIRS_DOWN) return '#aaaaaa';
    if (tileId >= TILES.BED_TOP && tileId <= TILES.BED_OPEN_BOTTOM) return '#8B4513';
    return '#5c3317'; // Armoires
}

function drawTile(tileId, worldX, worldY) {
    if (images[tileId] && images[tileId].complete && images[tileId].naturalWidth > 0) {
        ctx.drawImage(images[tileId], worldX, worldY, TILE_SIZE, TILE_SIZE);
    } else {
        ctx.fillStyle = getTileFallbackColor(tileId);
        ctx.fillRect(worldX, worldY, TILE_SIZE, TILE_SIZE);
    }
}

function drawGame() {
    // 1. Nettoyage et réglages
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.imageSmoothingEnabled = false;

    // Pas de map → rien à dessiner
    if (!mapTiles || mapTiles.length === 0) return;

    // 2. CALCUL DE LA CAMÉRA — si notre joueur n'existe pas encore, on centre sur (0,0)
    const me = playersState[socket.id];
    let camX = 0, camY = 0;
    if (me) {
        camX = (me.x + me.size / 2) * ZOOM_FACTOR - (canvas.width / 2);
        camY = (me.y + me.size / 2) * ZOOM_FACTOR - (canvas.height / 2);
    }

    ctx.save();
    ctx.translate(-camX, -camY);
    ctx.scale(ZOOM_FACTOR, ZOOM_FACTOR);

    // 3. DESSIN DE LA MAP (avec fallback couleur si l'image est absente)
    for (let ty = 0; ty < mapTiles.length; ty++) {
        for (let tx = 0; tx < mapTiles[0].length; tx++) {
            const tileId = mapTiles[ty][tx];
            const worldX = tx * TILE_SIZE;
            const worldY = ty * TILE_SIZE;

            // Sol en premier (clé numérique 0, PAS images.floor)
            drawTile(TILES.FLOOR, worldX, worldY);

            // Meuble / mur par-dessus
            if (tileId !== TILES.FLOOR) {
                drawTile(tileId, worldX, worldY);
            }
        }
    }

    // 4. DESSIN DES JOUEURS (avec fallback carré coloré)
    for (const id in playersState) {
        const p = playersState[id];
        if (!p.alive || p.role === 'SPECTATOR') continue;
        if (p.role === 'HIDER' && p.hidden && id !== socket.id) continue;

        const imgToDraw = (p.role === 'HUNTER') ? images.hunter : images.hider;
        const spriteSize = 32;
        const drawX = p.x - (spriteSize - p.size) / 2;
        const drawY = p.y - (spriteSize - p.size) / 2;

        if (imgToDraw && imgToDraw.complete && imgToDraw.naturalWidth > 0) {
            ctx.drawImage(imgToDraw, drawX, drawY, spriteSize, spriteSize);
        } else {
            ctx.fillStyle = (p.role === 'HUNTER') ? '#e63946' : '#2196f3';
            ctx.fillRect(drawX, drawY, spriteSize, spriteSize);
        }

        ctx.fillStyle = 'white';
        ctx.font = '5px "Press Start 2P"';
        ctx.fillText(p.pseudo, p.x - 5, p.y - 5);
    }

    ctx.restore();

    drawMinimap();

    // Overlay de décompte : le Chasseur voit noir pendant 10 secondes
    if (myRole === 'HUNTER' && hunterCountdown > 0) {
        const secondsLeft = Math.ceil(hunterCountdown / 1000);
        const cx = canvas.width / 2;
        const cy = canvas.height / 2;

        ctx.fillStyle = 'rgba(0, 0, 0, 0.93)';
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        ctx.textAlign = 'center';

        ctx.fillStyle = '#e63946';
        ctx.font = '18px "Press Start 2P"';
        ctx.fillText('CHASSEUR', cx, cy - 70);

        ctx.fillStyle = '#ffffff';
        ctx.font = '64px "Press Start 2P"';
        ctx.fillText(secondsLeft, cx, cy + 20);

        ctx.fillStyle = '#aaaaaa';
        ctx.font = '9px "Press Start 2P"';
        ctx.fillText('LES TRAQUES SE CACHENT...', cx, cy + 70);

        ctx.textAlign = 'left'; // reset
    }
}

// ==========================================
// 6. GESTION DES COLLISIONS
// ==========================================

// Détermine si une tuile précise est un obstacle
function isSolid(tileId) {
    if (tileId === TILES.FLOOR || tileId === TILES.STAIRS_UP || tileId === TILES.STAIRS_DOWN) return false;
    
    // Les portes et les intérieurs d'armoires ouvertes sont traversables
    if (tileId === TILES.ENTRY_DOOR) return false;
    if (tileId === TILES.WARDROBE_OPEN_BL || tileId === TILES.WARDROBE_OPEN_BR) return false;

    // Tout le reste (Murs, lits, armoires fermées) est solide
    return true;
}

// Vérifie si un carré (x, y, taille) touche un obstacle sur la carte
function collides(x, y, size) {
    // 1. Calculer la "Boîte de collision" en pixels
    const left = x;
    const right = x + size - 0.01; // Le -0.01 évite de mordre sur la tuile d'à côté
    const top = y;
    const bottom = y + size - 0.01;

    // 2. Convertir ces pixels en coordonnées de Grille (Tuiles)
    const startTx = Math.floor(left / TILE_SIZE);
    const endTx = Math.floor(right / TILE_SIZE);
    const startTy = Math.floor(top / TILE_SIZE);
    const endTy = Math.floor(bottom / TILE_SIZE);

    // 3. Vérifier qu'on ne sort pas des limites de la carte
    if (startTx < 0 || startTy < 0 || endTx >= mapTiles[0].length || endTy >= mapTiles.length) {
        return true;
    }

    // 4. Parcourir toutes les tuiles que le joueur chevauche
    for (let ty = startTy; ty <= endTy; ty++) {
        for (let tx = startTx; tx <= endTx; tx++) {
            const tileId = mapTiles[ty][tx];
            if (isSolid(tileId)) {
                return true; // Boum ! On touche un mur
            }
        }
    }

    return false; // Voie libre
}

// ==========================================
// 7. MÉCANIQUES DE CACHETTE ET D'INTERACTION
// ==========================================

// Liste des tuiles considérées comme des cachettes
function isHidingSpot(tile) {
    return [
        TILES.BED_TOP, TILES.BED_BOTTOM, TILES.BED_OPEN_TOP, TILES.BED_OPEN_BOTTOM,
        TILES.WARDROBE_CLOSED_L, TILES.WARDROBE_CLOSED_R,
        TILES.WARDROBE_OPEN_TL, TILES.WARDROBE_OPEN_TR,
        TILES.WARDROBE_OPEN_BL, TILES.WARDROBE_OPEN_BR
    ].includes(tile);
}

// Trouve le centre de la tuile interactive la plus proche
function findInteractiveTileCenter(cx, cy) {
    const offsets = [[0, 0], [0, -TILE_SIZE], [0, TILE_SIZE], [-TILE_SIZE, 0], [TILE_SIZE, 0]];
    
    for (let off of offsets) {
        let tx = Math.floor((cx + off[0]) / TILE_SIZE);
        let ty = Math.floor((cy + off[1]) / TILE_SIZE);
        
        if (ty >= 0 && ty < mapTiles.length && tx >= 0 && tx < mapTiles[0].length) {
            let tile = mapTiles[ty][tx];
            if (isHidingSpot(tile)) {
                return { 
                    tx: tx, ty: ty, 
                    px: tx * TILE_SIZE + TILE_SIZE / 2, 
                    py: ty * TILE_SIZE + TILE_SIZE / 2 
                };
            }
        }
    }
    return null;
}

// Modifie la carte pour ouvrir/fermer les meubles (Traduction de ton Java)
function toggleFurniture(tx, ty, isHunter) {
    if (ty < 0 || ty >= mapTiles.length || tx < 0 || tx >= mapTiles[0].length) return false;
    const tile = mapTiles[ty][tx];

    if (isHunter) {
        // Le Chasseur OUVRE les armoires et les lits
        if (tile === TILES.WARDROBE_CLOSED_L) {
            mapTiles[ty][tx] = TILES.WARDROBE_OPEN_TL;
            if (tx + 1 < mapTiles[0].length) mapTiles[ty][tx + 1] = TILES.WARDROBE_OPEN_TR;
            return true;
        } else if (tile === TILES.WARDROBE_CLOSED_R) {
            mapTiles[ty][tx] = TILES.WARDROBE_OPEN_TR;
            if (tx - 1 >= 0) mapTiles[ty][tx - 1] = TILES.WARDROBE_OPEN_TL;
            return true;
        } else if (tile === TILES.BED_TOP) {
            mapTiles[ty][tx] = TILES.BED_OPEN_TOP;
            if (ty + 1 < mapTiles.length) mapTiles[ty + 1][tx] = TILES.BED_OPEN_BOTTOM;
            return true;
        } else if (tile === TILES.BED_BOTTOM) {
            mapTiles[ty][tx] = TILES.BED_OPEN_BOTTOM;
            if (ty - 1 >= 0) mapTiles[ty - 1][tx] = TILES.BED_OPEN_TOP;
            return true;
        }
    } else {
        // Le Traqué FERME l'armoire derrière lui
        if (tile >= TILES.WARDROBE_OPEN_TL && tile <= TILES.WARDROBE_OPEN_BR) {
            // Simplification : on remet l'armoire fermée classique
            mapTiles[ty][tx] = TILES.WARDROBE_CLOSED_L; 
            if (tx + 1 < mapTiles[0].length) mapTiles[ty][tx + 1] = TILES.WARDROBE_CLOSED_R;
            return true;
        } else if (tile === TILES.BED_OPEN_TOP) {
            mapTiles[ty][tx] = TILES.BED_TOP;
            if (ty + 1 < mapTiles.length) mapTiles[ty + 1][tx] = TILES.BED_BOTTOM;
            return true;
        } else if (tile === TILES.BED_OPEN_BOTTOM) {
            mapTiles[ty][tx] = TILES.BED_BOTTOM;
            if (ty - 1 >= 0) mapTiles[ty - 1][tx] = TILES.BED_TOP;
            return true;
        }
    }
    return false;
}

// L'action principale du Traqué
function handleHiderAction(p) {
    if (p.hidden) {
        // 1. SORTIR DE LA CACHETTE
        p.hidden = false;
        p.x = p.entryX; // Il réapparaît là où il était avant de se cacher
        p.y = p.entryY;
    } else {
        // 2. ENTRER DANS LA CACHETTE
        const cx = p.x + p.size / 2;
        const cy = p.y + p.size / 2;
        const target = findInteractiveTileCenter(cx, cy);

        if (target) {
            // Sauvegarde de la position pour la sortie
            p.entryX = p.x;
            p.entryY = p.y;

            // Fermer ou ouvrir le meuble visuellement
            toggleFurniture(target.tx, target.ty, false);

            p.hidden = true;
            
            // Téléportation magique au centre de l'armoire
            p.x = target.px - p.size / 2;
            p.y = target.py - p.size / 2;
        }
    }
}

// L'action principale du Chasseur (Fouiller)
function handleHunterSearch(p) {
    const cx = p.x + p.size / 2;
    const cy = p.y + p.size / 2;
    const target = findInteractiveTileCenter(cx, cy);

    if (target) {
        const opened = toggleFurniture(target.tx, target.ty, true);
        if (opened) {
            // Si le chasseur a ouvert un meuble, on vérifie s'il y a un joueur caché dedans
            for (const id in playersState) {
                const targetPlayer = playersState[id];
                if (targetPlayer.role === 'HIDER' && targetPlayer.alive && targetPlayer.hidden) {
                    const tCx = targetPlayer.x + targetPlayer.size / 2;
                    const tCy = targetPlayer.y + targetPlayer.size / 2;
                    // Vérifie si le traqué est au centre de ce meuble précis
                    if (Math.hypot(tCx - target.px, tCy - target.py) < 48) {
                        targetPlayer.alive = false;
                        targetPlayer.hidden = false;
                        console.log(targetPlayer.pseudo + " a été trouvé et éliminé !");
                    }
                }
            }
        }
    }
}

socket.on('timerUpdate', (timeLeft) => {
    timeRemaining = timeLeft;
    document.getElementById('time-left').innerText = "Temps : " + Math.floor(timeRemaining / 1000);
});

