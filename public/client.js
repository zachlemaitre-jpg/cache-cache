const socket = io();

// 1. D'ABORD LES TUILES
const TILES = {
    FLOOR: 0, WALL: 1, ENTRY_DOOR: 99,
    BED_TOP: 10, BED_BOTTOM: 11, BED_OPEN_TOP: 12, BED_OPEN_BOTTOM: 13,
    WARDROBE_CLOSED_L: 20, WARDROBE_CLOSED_R: 21,
    WARDROBE_OPEN_TL: 22, WARDROBE_OPEN_TR: 23, WARDROBE_OPEN_BL: 24, WARDROBE_OPEN_BR: 25,
    SHELF: 26,     // Étagère/Armoire générique (Blocs rouges)
    DESK: 30,      // Bureau (Bloc bleu)
    BATHTUB: 40,   // Baignoire (Bloc jaune)
    TOILET: 50,    // Toilettes (Bloc marron)
    STAIRS_UP: 90, STAIRS_DOWN: 91 // Escaliers (Blocs bleu clair)
};

// 2. ENSUITE LE DICTIONNAIRE D'IMAGES (Un seul !)
const imagePaths = {
    // === TRAQUÉ (HIDER) ===
    hider_down: 'assets/hider_down.png',
    hider_up: 'assets/hider_up.png',
    hider_left: 'assets/hider_left.png',
    hider_right: 'assets/hider_right.png',

    // === CHASSEUR (HUNTER) - IDLE ===
    hunter_idle_down: 'assets/hunter_idle_down.png',
    hunter_idle_up: 'assets/hunter_idle_up.png',
    hunter_idle_left: 'assets/hunter_idle_left.png',
    hunter_idle_right: 'assets/hunter_idle_right.png',

    // === CHASSEUR (HUNTER) - WALK ===
    hunter_walk1_down: 'assets/hunter_walk1_down.png',
    hunter_walk2_down: 'assets/hunter_walk2_down.png',
    hunter_walk1_up: 'assets/hunter_walk1_up.png',
    hunter_walk2_up: 'assets/hunter_walk2_up.png',
    hunter_walk1_left: 'assets/hunter_walk1_left.png',
    hunter_walk2_left: 'assets/hunter_walk2_left.png',
    hunter_walk1_right: 'assets/hunter_walk1_right.png',
    hunter_walk2_right: 'assets/hunter_walk2_right.png',
    
    // === DÉCORS ET MEUBLES ===
    [TILES.FLOOR]: 'assets/sol.png',
    [TILES.WALL]: 'assets/mur.png',
    [TILES.WARDROBE_CLOSED_L]: 'assets/AF-L.png',
    [TILES.WARDROBE_CLOSED_R]: 'assets/AF-R.png'
};

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

let isPlaying = false;
let mapTiles = [];
let playersState = {};
let timeRemaining = 0;
let hunterCountdown = 0; // Décompte de 10s avant que le chasseur puisse jouer
let clientsInputs = {};
let isWallGrid = []; // NOUVEAU : La grille de collision et d'ombre
let furnitures = []; // Liste des entités (vide pour l'instant)

// --- Gestion des Touches ---
const keys = { up: false, down: false, left: false, right: false, action1: false, action2: false };

window.addEventListener('keydown', (e) => {
    const key = e.key.toLowerCase(); // Transforme Z en z
    if (key === 'z' || e.key === 'ArrowUp') keys.up = true;
    if (key === 's' || e.key === 'ArrowDown') keys.down = true;
    if (key === 'q' || e.key === 'ArrowLeft') keys.left = true;
    if (key === 'd' || e.key === 'ArrowRight') keys.right = true;
    if (key === 'e') keys.action1 = true; 
    if (key === 'f') keys.action2 = true; 
});

window.addEventListener('keyup', (e) => {
    const key = e.key.toLowerCase();
    if (key === 'z' || e.key === 'ArrowUp') keys.up = false;
    if (key === 's' || e.key === 'ArrowDown') keys.down = false;
    if (key === 'q' || e.key === 'ArrowLeft') keys.left = false;
    if (key === 'd' || e.key === 'ArrowRight') keys.right = false;
    if (key === 'e') keys.action1 = false;
    if (key === 'f') keys.action2 = false;
});

// --- Préchargement des Images ---
const images = {};
// Associe chaque type de tuile (et les personnages) à son chemin d'image

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
    document.getElementById('game-message').style.display = 'none';
    showScreen('game-screen');
    initGameEngine();
});

socket.on('returnedToLobby', () => {
    isPlaying = false;
    hunterCountdown = 0;
    mapTiles = [];
    playersState = {};
    clientsInputs = {};
    document.getElementById('game-message').style.display = 'none';
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
        furnitures = state.furnitures; // <-- NOUVEAU !
        timeRemaining = state.timeRemaining; 
        hunterCountdown = state.hunterCountdown;
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
    
    generateInitialState();

    // Envoi des inputs au serveur (30 fps)
    setInterval(() => {
        if (!isPlaying) return;
        socket.emit('playerInput', { room: currentRoom, input: { ...keys } });
    }, 1000 / 30);

    lastTime = performance.now();
    requestAnimationFrame(gameLoop);
}

// --- NOUVELLE STRUCTURE DE CARTE ---

function generateInitialState() {
    // 1. Initialisation de la grille de murs (896x480px / 16px => 30 lignes x 56 colonnes)
    isWallGrid = [];
    for (let y = 0; y < 30; y++) {
        isWallGrid[y] = new Array(56).fill(false);
    }
    furnitures = []; 

    // Outils de traçage sur grille
    function addWallBlock(gx, gy, gWidth, gHeight) {
        for (let y = gy; y < gy + gHeight; y++) {
            for (let x = gx; x < gx + gWidth; x++) {
                if (y >= 0 && y < 30 && x >= 0 && x < 56) isWallGrid[y][x] = true;
            }
        }
    }
    function addDiagonalWall(idPrefix, startX, startY, endX, endY) {
        const steps = 60;
        const dx = (endX - startX) / steps;
        const dy = (endY - startY) / steps;
        for (let i = 0; i <= steps; i++) {
            const gx = Math.floor((startX + (dx * i)) / 16);
            const gy = Math.floor((startY + (dy * i)) / 16);
            if (gy >= 0 && gy < 30 && gx >= 0 && gx < 56) isWallGrid[gy][gx] = true;
        }
    }

    // MURS EXTÉRIEURS
    addWallBlock(0, 0, 56, 1);    addWallBlock(0, 29, 56, 1);
    addWallBlock(0, 0, 1, 30);    addWallBlock(55, 0, 1, 30);

    // PIÈCE GAUCHE
    addWallBlock(1, 4, 15, 1);    addWallBlock(15, 4, 1, 9);
    addWallBlock(1, 4, 1, 5);     addWallBlock(0, 9, 1, 1);
    addWallBlock(1, 9, 1, 11);

    // ALCÔVES BAS GAUCHE
    addWallBlock(1, 21, 2, 1);    addWallBlock(3, 21, 1, 8);
    addWallBlock(3, 28, 3, 1);    addWallBlock(5, 21, 1, 8);
    addWallBlock(6, 21, 2, 1);    addWallBlock(7, 21, 1, 8);
    addWallBlock(7, 28, 3, 1);    addWallBlock(10, 21, 1, 8);
    addWallBlock(10, 21, 2, 1);

    // DIAGONALE (Mêmes pixels de départ, convertis par l'outil)
    addDiagonalWall("diag_g", 192, 336, 240, 256);

    // COULOIR ET PIÈCE CENTRALE
    addWallBlock(16, 12, 8, 1);   addWallBlock(24, 12, 11, 1);
    addWallBlock(38, 12, 17, 1);  addWallBlock(16, 15, 39, 1);

    // PIÈCE CENTRALE HAUTE
    addWallBlock(24, 2, 1, 11);   addWallBlock(24, 2, 16, 1);
    addWallBlock(40, 2, 1, 4);    addWallBlock(38, 6, 3, 1);
    addWallBlock(38, 6, 1, 7);

    // PIÈCE DROITE
    addWallBlock(45, 9, 10, 1);   addWallBlock(54, 9, 1, 7);

    // JOUEURS
    timeRemaining = gameSettings.roundDuration;
    hunterCountdown = 10000;
    const spawns = [{x: 300, y: 210}, {x: 450, y: 210}, {x: 550, y: 210}, {x: 750, y: 210}];
    let idx = 0;
    for (const id in playersState) {
        let p = playersState[id];
        p.x = spawns[idx % spawns.length].x; p.y = spawns[idx % spawns.length].y;
        p.alive = true; p.hidden = false; p.dir = 'down'; p.moving = false; p.animTimer = 0;
        idx++;
    }
}

let lastTime = 0;

function gameLoop(time) {
    if (!isPlaying) return;
    
    const deltaMs = time - lastTime;
    lastTime = time;

    if (isHost) computeHostPhysics(deltaMs);
    drawGame();
    
    // NOUVEAU : On vérifie qui a gagné à chaque image !
    checkVictory(); 

    if (isPlaying) {
        requestAnimationFrame(gameLoop);
    }
}

function checkVictory() {
    if (!isPlaying || timeRemaining === undefined) return;

    let hasHider = false;
    let hidersAlive = false;

    for (const id in playersState) {
        if (playersState[id].role === 'HIDER') {
            hasHider = true;
            if (playersState[id].alive) hidersAlive = true;
        }
    }

    // 1. Si tous les traqués sont attrapés (et qu'il y en avait au moins un)
    if (hasHider && !hidersAlive) {
        triggerGameOver("VICTOIRE CHASSEUR", "#e63946");
    } 
    // 2. Si le temps est écoulé
    else if (timeRemaining <= 0) {
        if (hidersAlive) {
            triggerGameOver("VICTOIRE TRAQUÉS", "#2196f3");
        } else {
            triggerGameOver("VICTOIRE CHASSEUR", "#e63946");
        }
    }
}

function triggerGameOver(text, color) {
    isPlaying = false; // Gèle l'écran
    
    const msgDiv = document.getElementById('game-message');
    msgDiv.innerText = text;
    msgDiv.style.color = color;
    msgDiv.style.fontSize = '2rem';
    msgDiv.style.position = 'absolute';
    msgDiv.style.top = '50%';
    msgDiv.style.left = '50%';
    msgDiv.style.transform = 'translate(-50%, -50%)';
    msgDiv.style.padding = '30px 50px';
    msgDiv.style.background = 'rgba(0, 0, 0, 0.9)';
    msgDiv.style.border = `6px solid ${color}`;
    msgDiv.style.textShadow = '4px 4px #000';
    msgDiv.style.display = 'block';
    msgDiv.style.zIndex = '100';
    msgDiv.style.textAlign = 'center';
}

// --- LE CERVEAU DU JEU (Exécuté uniquement par l'Hôte) ---
function computeHostPhysics(deltaMs) {
    if (deltaMs > 100) deltaMs = 100;

    // 1. Décompte initial (le Chasseur attend)
    hunterCountdown = Math.max(0, hunterCountdown - deltaMs);

    // 2. Récupération des touches de l'Hôte
    clientsInputs[socket.id] = { ...keys };

    // 3. Boucle sur tous les joueurs
    for (const clientId in playersState) {
        const p = playersState[clientId];
        const input = clientsInputs[clientId] || { up: false, down: false, left: false, right: false, action1: false, action2: false };

        if (!p.alive || p.role === 'SPECTATOR') continue;

        // Le Chasseur est bloqué pendant les 10 premières secondes
        if (p.role === 'HUNTER' && hunterCountdown > 0) {
            p.moving = false;
            continue;
        }

        // --- GESTION DES ACTIONS (E / F) ---
        const justPressedAction1 = input.action1 && !p.lastAction1;
        p.lastAction1 = input.action1;
        const justPressedAction2 = input.action2 && !p.lastAction2;
        p.lastAction2 = input.action2;

        if (p.role === 'HIDER') {
            if (justPressedAction1) handleHiderAction(p);
            if (p.hidden) continue; 
        } else if (p.role === 'HUNTER') {
            if (justPressedAction1 || justPressedAction2) handleHunterSearch(p);
            
            // Kill au contact
            for (const targetId in playersState) {
                const target = playersState[targetId];
                if (target.role === 'HIDER' && target.alive && !target.hidden) {
                    const dx = (target.x + target.size/2) - (p.x + p.size/2);
                    const dy = (target.y + target.size/2) - (p.y + p.size/2);
                    if (Math.hypot(dx, dy) < p.size) {
                        target.alive = false;
                    }
                }
            }
        }

        // --- GESTION DU DÉPLACEMENT ET ANIMATION ---
        let vx = 0, vy = 0;
        if (input.up) vy -= 1;
        if (input.down) vy += 1;
        if (input.left) vx -= 1;
        if (input.right) vx += 1;

        if (vx !== 0 || vy !== 0) {
            p.moving = true;
            p.animTimer += deltaMs;
            
            // Déterminer la direction (priorité X puis Y)
            if (Math.abs(vx) > Math.abs(vy)) {
                p.dir = vx > 0 ? 'right' : 'left';
            } else {
                p.dir = vy > 0 ? 'down' : 'up';
            }
        } else {
            p.moving = false;
            p.animTimer = 0;
        }

        const len = Math.hypot(vx, vy);
        if (len > 0) { vx /= len; vy /= len; }
        
        const dist = p.speed * (deltaMs / 1000.0);
        let newX = p.x + vx * dist;
        let newY = p.y + vy * dist;
        
        if (!collides(newX, p.y, p.size)) p.x = newX;
        if (!collides(p.x, newY, p.size)) p.y = newY;
    }

    // 4. Envoi de l'état aux invités
    socket.emit('stateSnapshot', {
        room: currentRoom,
        state: {
            players: playersState,
            currentMapTiles: mapTiles,
            furnitures: furnitures, // <-- NOUVEAU !
            timeRemaining: timeRemaining,
            hunterCountdown: hunterCountdown
        }
    });

    updateHUD();
}

// ==========================================
// 5. MOTEUR GRAPHIQUE (CANVAS)
// ==========================================

const ZOOM_FACTOR = 3; // On multiplie la taille par 3 pour l'effet Pixel Art

// ==========================================
// MINIMAP
// ==========================================

// Renvoie la couleur d'une tuile pour la minimap.
// La furniture est toujours montrée fermée (pas de changement d'état visible).
function getMinimapColor(id) {
    if (id === TILES.FLOOR) return '#7e7e7e'; // Sol gris moyen
    if (id === TILES.WALL) return '#1a1a1a';  // Murs gris très foncé
    if (id >= 20 && id <= 26) return '#ec545b'; // Rouge (Meubles)
    if (id === TILES.DESK) return '#3d4b96'; // Bleu (Bureau)
    if (id === TILES.BATHTUB) return '#e1cc55'; // Jaune (Bain)
    if (id === TILES.TOILET) return '#533215'; // Marron (WC)
    if (id === TILES.STAIRS_UP || id === TILES.STAIRS_DOWN) return '#b9d9f5'; // Bleu clair (Escaliers)
    return '#000';
}

const minimapCanvas = document.getElementById('minimap-canvas');
const minimapCtx = minimapCanvas.getContext('2d');



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

// ==========================================
// OUTIL DE LIGNE DE VUE (INSPIRÉ DU JAVA)
// ==========================================
function hasLineOfSight(x0, y0, x1, y1) {
    const dx = x1 - x0;
    const dy = y1 - y0;
    const distance = Math.hypot(dx, dy);
    const steps = Math.max(1, distance / 8); 
    
    for (let i = 0; i <= steps; i++) {
        const checkX = x0 + (dx * (i / steps));
        const checkY = y0 + (dy * (i / steps));
        
        // On calcule la position dans la grille de 16px
        const gx = Math.floor(checkX / 16);
        const gy = Math.floor(checkY / 16);

        // Vérification de collision sur la grille
        if (gy >= 0 && gy < 30 && gx >= 0 && gx < 56) {
            if (isWallGrid[gy][gx]) {
                return false; // Ligne bloquée par la grille
            }
        }
    }
    return true; 
}

function drawGame() {
    ctx.fillStyle = '#000'; ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.imageSmoothingEnabled = false;

    if (!isWallGrid || isWallGrid.length === 0) return;

    const me = playersState[socket.id];
    let camX = 0, camY = 0;
    if (me) {
        camX = (me.x + me.size / 2) * ZOOM_FACTOR - (canvas.width / 2);
        camY = (me.y + me.size / 2) * ZOOM_FACTOR - (canvas.height / 2);
    }

    ctx.save();
    ctx.translate(-camX, -camY);
    ctx.scale(ZOOM_FACTOR, ZOOM_FACTOR);

    // 1 & 2. GRILLE (Sol et Murs)
    for (let gy = 0; gy < 30; gy++) {
        for (let gx = 0; gx < 56; gx++) {
            const worldX = gx * 16;
            const worldY = gy * 16;
            
            if (isWallGrid[gy][gx]) {
                ctx.fillStyle = '#1a1a1a';
                ctx.fillRect(worldX, worldY, 16, 16);
            } else {
                if (images[TILES.FLOOR] && images[TILES.FLOOR].complete) {
                    ctx.drawImage(images[TILES.FLOOR], worldX, worldY, 16, 16);
                } else {
                    ctx.fillStyle = '#7e7e7e';
                    ctx.fillRect(worldX, worldY, 16, 16);
                }
            }
        }
    }

    // 3. JOUEURS
    for (const id in playersState) {
        const p = playersState[id];
        if (!p.alive || (p.role === 'HIDER' && p.hidden && id !== socket.id)) continue;

        const spriteSize = 32;
        const drawX = p.x - (spriteSize - p.size) / 2;
        const drawY = p.y - (spriteSize - p.size) / 2;
        const imgKey = p.role === 'HUNTER' ? (p.moving ? `hunter_walk${(Math.floor(p.animTimer / 200) % 2)+1}_${p.dir}` : `hunter_idle_${p.dir}`) : `hider_${p.dir}`;
        const img = images[imgKey] || images.hider_down;

        if (img && img.complete) ctx.drawImage(img, drawX, drawY, spriteSize, spriteSize);
        else { ctx.fillStyle = (p.role === 'HUNTER') ? '#e63946' : '#2196f3'; ctx.fillRect(p.x, p.y, p.size, p.size); }
    }

    // 4. BROUILLARD
    if (me && me.alive && me.role !== 'SPECTATOR') {
        const px = me.x + me.size / 2;
        const py = me.y + me.size / 2;
        const farRadius = (me.role === 'HUNTER') ? 250 : 150;
        const nearRadius = farRadius * 0.5; 
        
        for (let y = 0; y < 480; y += 16) {
            for (let x = 0; x < 896; x += 16) {
                const cx = x + 8;
                const cy = y + 8;
                const dist = Math.hypot(cx - px, cy - py);
                let alpha = 1.0; 
                
                if (dist < farRadius && hasLineOfSight(px, py, cx, cy)) {
                    alpha = (dist <= nearRadius) ? 0.0 : (dist - nearRadius) / (farRadius - nearRadius);
                }
                
                if (alpha > 0) {
                    ctx.fillStyle = `rgba(0, 0, 0, ${Math.min(alpha, 0.98)})`;
                    ctx.fillRect(x, y, 16, 16);
                }
            }
        }
    }
    ctx.restore(); 
    drawMinimap();

    if (myRole === 'HUNTER' && hunterCountdown > 0) {
        ctx.fillStyle = 'rgba(0, 0, 0, 0.95)';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.textAlign = 'center';
        ctx.fillStyle = '#ffffff';
        ctx.font = '60px "Press Start 2P"';
        ctx.fillText(Math.ceil(hunterCountdown / 1000), canvas.width/2, canvas.height/2 + 20);
        ctx.textAlign = 'left';
    }
}

function drawMinimap() {
    if (!isWallGrid || isWallGrid.length === 0) return;

    const rows = 30;
    const cols = 56;
    const miniTileSize = 4; // 4px par bloc pour que ça rentre bien
    const scale = miniTileSize / 16;

    if (minimapCanvas.width !== cols * miniTileSize || minimapCanvas.height !== rows * miniTileSize) {
        minimapCanvas.width  = cols * miniTileSize;
        minimapCanvas.height = rows * miniTileSize;
    }

    minimapCtx.imageSmoothingEnabled = false;

    // 1. SOL ET MURS
    for (let gy = 0; gy < rows; gy++) {
        for (let gx = 0; gx < cols; gx++) {
            if (isWallGrid[gy][gx]) {
                minimapCtx.fillStyle = '#1a1a1a'; // Mur
            } else {
                minimapCtx.fillStyle = '#7e7e7e'; // Sol
            }
            minimapCtx.fillRect(gx * miniTileSize, gy * miniTileSize, miniTileSize, miniTileSize);
        }
    }

    // 2. MEUBLES (S'il y en a)
    if (typeof furnitures !== 'undefined') {
        for (const f of furnitures) {
            minimapCtx.fillStyle = getMinimapColor(f.type);
            minimapCtx.fillRect(f.x * scale, f.y * scale, f.width * scale, f.height * scale);
        }
    }

    // 3. JOUEURS
    for (const id in playersState) {
        const p = playersState[id];
        if (!p.alive || p.role === 'SPECTATOR') continue;
        if (p.role === 'HIDER' && p.hidden && id !== socket.id) continue;

        minimapCtx.fillStyle = (p.role === 'HUNTER') ? '#e63946' : '#2196f3';
        const miniCx = (p.x + p.size / 2) * scale;
        const miniCy = (p.y + p.size / 2) * scale;
        
        minimapCtx.beginPath();
        minimapCtx.arc(miniCx, miniCy, 3, 0, Math.PI * 2);
        minimapCtx.fill();
    }
}

// ==========================================
// 6. GESTION DES COLLISIONS (SYSTÈME AABB)
// ==========================================

function collides(x, y, size) {
    if (x < 0 || x + size > 896 || y < 0 || y + size > 480) return true;
    
    const points = [[x, y], [x + size, y], [x, y + size], [x + size, y + size]];
    for (const p of points) {
        const gx = Math.floor(p[0] / 16);
        const gy = Math.floor(p[1] / 16);
        if (gy >= 0 && gy < 30 && gx >= 0 && gx < 56) {
            if (isWallGrid[gy][gx]) return true;
        }
    }
    
    // On garde la vérification pour les futurs meubles
    for (const f of furnitures) {
        if (f.type === TILES.ENTRY_DOOR) continue;
        if (f.type === TILES.WARDROBE_OPEN_TL || f.type === TILES.WARDROBE_OPEN_TR) continue;
        if (f.type === TILES.BED_OPEN_TOP || f.type === TILES.BED_OPEN_BOTTOM) continue;

        if (x + size > f.x && x < f.x + f.width && y + size > f.y && y < f.y + f.height) {
            return true;
        }
    }
    return false;
}

// ==========================================
// 7. MÉCANIQUES DE CACHETTE (ENTITÉS)
// ==========================================

function isHidingSpot(type) {
    return [
        TILES.BED_TOP, TILES.BED_BOTTOM, TILES.BED_OPEN_TOP, TILES.BED_OPEN_BOTTOM,
        TILES.WARDROBE_CLOSED_L, TILES.WARDROBE_CLOSED_R,
        TILES.WARDROBE_OPEN_TL, TILES.WARDROBE_OPEN_TR,
        TILES.SHELF
    ].includes(type);
}

// Cherche le meuble interactif le plus proche du joueur (Rayon de 40px max)
function findInteractiveFurniture(cx, cy) {
    let closest = null;
    let minDist = 40; 

    for (const f of furnitures) {
        if (!isHidingSpot(f.type)) continue;

        // On calcule le centre du meuble
        let fCx = f.x + f.width / 2;
        let fCy = f.y + f.height / 2;
        let dist = Math.hypot(cx - fCx, cy - fCy);

        if (dist < minDist) {
            minDist = dist;
            closest = f;
        }
    }
    return closest;
}

function toggleFurniture(f, isHunter) {
    if (isHunter) {
        // Le chasseur OUVRE
        if (f.type === TILES.WARDROBE_CLOSED_L || f.type === TILES.WARDROBE_CLOSED_R) {
            f.type = TILES.WARDROBE_OPEN_TL; 
            return true;
        } else if (f.type === TILES.BED_TOP || f.type === TILES.BED_BOTTOM) {
            f.type = TILES.BED_OPEN_TOP;
            return true;
        }
    } else {
        // Le traqué FERME derrière lui
        if (f.type === TILES.WARDROBE_OPEN_TL || f.type === TILES.WARDROBE_OPEN_TR) {
            f.type = TILES.WARDROBE_CLOSED_L;
            return true;
        } else if (f.type === TILES.BED_OPEN_TOP || f.type === TILES.BED_OPEN_BOTTOM) {
            f.type = TILES.BED_TOP;
            return true;
        }
    }
    return false;
}

function handleHiderAction(p) {
    if (p.hidden) {
        p.hidden = false;
        p.x = p.entryX; 
        p.y = p.entryY;
    } else {
        const cx = p.x + p.size / 2;
        const cy = p.y + p.size / 2;
        const target = findInteractiveFurniture(cx, cy);

        if (target) {
            p.entryX = p.x;
            p.entryY = p.y;
            toggleFurniture(target, false);
            p.hidden = true;
            
            // On le téléporte pile au centre du meuble
            p.x = target.x + (target.width / 2) - (p.size / 2);
            p.y = target.y + (target.height / 2) - (p.size / 2);
        }
    }
}

function handleHunterSearch(p) {
    const cx = p.x + p.size / 2;
    const cy = p.y + p.size / 2;
    const target = findInteractiveFurniture(cx, cy);

    if (target) {
        const opened = toggleFurniture(target, true);
        if (opened) {
            for (const id in playersState) {
                const targetPlayer = playersState[id];
                if (targetPlayer.role === 'HIDER' && targetPlayer.alive && targetPlayer.hidden) {
                    const tCx = targetPlayer.x + targetPlayer.size / 2;
                    const tCy = targetPlayer.y + targetPlayer.size / 2;
                    const fCx = target.x + target.width / 2;
                    const fCy = target.y + target.height / 2;
                    
                    // Si le traqué est au centre de ce meuble précis
                    if (Math.hypot(tCx - fCx, tCy - fCy) < 10) {
                        targetPlayer.alive = false;
                        targetPlayer.hidden = false;
                        console.log(targetPlayer.pseudo + " a été attrapé dans sa cachette !");
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

// OUTIL DE DÉBUG : Affiche la position de la souris pour aider à placer les meubles
canvas.addEventListener('mousemove', (e) => {
    const rect = canvas.getBoundingClientRect();
    // On calcule la position en tenant compte du ZOOM et de la CAMÉRA
    const me = playersState[socket.id];
    let camX = me ? (me.x + me.size / 2) * ZOOM_FACTOR - (canvas.width / 2) : 0;
    let camY = me ? (me.y + me.size / 2) * ZOOM_FACTOR - (canvas.height / 2) : 0;

    const mouseX = Math.round((e.clientX - rect.left + camX) / ZOOM_FACTOR);
    const mouseY = Math.round((e.clientY - rect.top + camY) / ZOOM_FACTOR);

    // On affiche l'info dans le titre de la page ou dans la console
    document.title = `X: ${mouseX} | Y: ${mouseY}`;
});
