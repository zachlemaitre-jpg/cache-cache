const express = require('express');
const app = express();
const http = require('http').createServer(app);
const io = require('socket.io')(http);

// Le dossier 'public' contiendra ton index.html, ton CSS et ton JS client
app.use(express.static(__dirname + '/public'));

// Stockage de tous les salons en mémoire
let rooms = {};

io.on('connection', (socket) => {
    console.log('🟢 Nouvelle connexion:', socket.id);

    // ==========================================
    // 1. CRÉATION ET REJOINDRE UN SALON
    // ==========================================

    socket.on('createRoom', (data) => {
        let roomCode;
        // Génère un code à 6 caractères unique
        do {
            roomCode = Math.random().toString(36).substring(2, 8).toUpperCase();
        } while (rooms[roomCode]);

        const pseudo = data.pseudo || 'Hôte';

        // Initialisation du salon
        rooms[roomCode] = {
            clients: [{ id: socket.id, pseudo: pseudo, role: 'SPECTATOR' }],
            settings: { roundDuration: 120000, mapIndex: 0 },
            isPlaying: false,
            lastActivity: Date.now()
        };

        socket.join(roomCode);
        
        socket.emit('lobbyJoined', {
            roomCode: roomCode,
            isHost: true,
            settings: rooms[roomCode].settings
        });

        io.to(roomCode).emit('playersUpdated', rooms[roomCode].clients);
    });

    socket.on('joinRoom', (data) => {
        const roomCode = data.roomCode.toUpperCase();
        const pseudo = data.pseudo || 'Invité';
        const room = rooms[roomCode];

        if (!room) {
            socket.emit('errorMsg', "Ce salon n'existe pas.");
            return;
        }

        if (room.isPlaying) {
            socket.emit('errorMsg', "La partie a déjà commencé.");
            return;
        }

        socket.join(roomCode);
        
        // Ajoute le joueur s'il n'y est pas déjà
        if (!room.clients.find(c => c.id === socket.id)) {
            room.clients.push({ id: socket.id, pseudo: pseudo, role: 'SPECTATOR' });
        }

        socket.emit('lobbyJoined', {
            roomCode: roomCode,
            isHost: false,
            settings: room.settings
        });

        io.to(roomCode).emit('playersUpdated', room.clients);
    });

    // ==========================================
    // 2. GESTION DU LOBBY (Rôles et Paramètres)
    // ==========================================

    socket.on('lobbyAction', (data) => {
        const room = rooms[data.room];
        if (!room) return;
        room.lastActivity = Date.now();

        const client = room.clients.find(c => c.id === socket.id);
        if (!client) return;

        const isHost = room.clients[0].id === socket.id;

        // --- Gestion des Rôles ---
        if (data.action === 'REQUEST_HUNTER') {
            // Vérifie qu'il n'y a pas déjà un Hunter
            if (!room.clients.some(c => c.role === 'HUNTER')) {
                client.role = 'HUNTER';
            }
        }
        else if (data.action === 'REQUEST_HIDER') {
            // Limite à 4 Hiders max
            const hiderCount = room.clients.filter(c => c.role === 'HIDER').length;
            if (hiderCount < 4) {
                client.role = 'HIDER';
            }
        }
        else if (data.action === 'REQUEST_SPECTATOR') {
            client.role = 'SPECTATOR';
        }

        // --- Gestion des Paramètres (Seul l'Hôte peut faire ça) ---
        if (isHost && data.action.startsWith('SET_TIME')) {
            if (data.action === 'SET_TIME_120') room.settings.roundDuration = 120000;
            if (data.action === 'SET_TIME_180') room.settings.roundDuration = 180000;
            if (data.action === 'SET_TIME_240') room.settings.roundDuration = 240000;
            // On prévient tout le monde du changement de temps
            io.to(data.room).emit('settingsUpdated', room.settings);
        }

        // On met à jour l'affichage de tout le monde
        io.to(data.room).emit('playersUpdated', room.clients);
    });

    // ==========================================
    // 3. LANCEMENT ET LOGIQUE DE JEU (LE RELAIS)
    // ==========================================

    socket.on('startGame', (roomCode) => {
        const room = rooms[roomCode];
        // Seul l'hôte peut lancer
        if (room && room.clients[0].id === socket.id) {
            room.isPlaying = true;
            io.to(roomCode).emit('gameStarted');
        }
    });

    // ⚡ L'Invité envoie ses touches de clavier (Z,Q,S,D,E)
    socket.on('playerInput', (data) => {
        const room = rooms[data.room];
        if (!room) return;

        // On relaie l'input EXCLUSIVEMENT à l'Hôte (client d'index 0)
        const hostId = room.clients[0].id;
        if (socket.id !== hostId) {
            io.to(hostId).emit('clientInput', {
                clientId: socket.id, // Pour que l'hôte sache qui a appuyé
                input: data.input    // { up, down, left, right, action1, action2 }
            });
        }
    });

    // ⚡ L'Hôte envoie la position de tout le monde (Le Snapshot)
    socket.on('stateSnapshot', (data) => {
        const room = rooms[data.room];
        // Sécurité : Seul l'hôte a le droit d'envoyer l'état officiel
        if (room && room.clients[0].id === socket.id) {
            room.lastActivity = Date.now();
            // Le serveur broadcast à tous les AUTRES joueurs du salon
            socket.to(data.room).emit('syncState', data.state);
        }
    });

    // ==========================================
    // 4. DÉCONNEXION & MIGRATION
    // ==========================================

    socket.on('leaveRoom', (roomCode) => {
        const room = rooms[roomCode];
        if (!room) return;

        const index = room.clients.findIndex(c => c.id === socket.id);
        if (index === -1) return;

        socket.leave(roomCode);
        room.clients.splice(index, 1);

        if (room.clients.length === 0) {
            delete rooms[roomCode];
        } else {
            if (index === 0) {
                io.to(room.clients[0].id).emit('hostMigrated');
            }
            io.to(roomCode).emit('playersUpdated', room.clients);
        }
        console.log(`🚪 ${socket.id} a quitté le salon ${roomCode}`);
    });

    socket.on('disconnect', () => {
        for (const roomCode in rooms) {
            const room = rooms[roomCode];
            const index = room.clients.findIndex(c => c.id === socket.id); 
            
            if (index !== -1) {
                room.clients.splice(index, 1);
                
                if (room.clients.length === 0) {
                    delete rooms[roomCode]; // On détruit le salon vide
                } else {
                    // MIGRATION D'HÔTE : Si l'hôte (index 0) part, le 2ème joueur prend sa place
                    if (index === 0) {
                        io.to(room.clients[0].id).emit('hostMigrated');
                    }
                    io.to(roomCode).emit('playersUpdated', room.clients);
                }
            }
        }
        console.log('🔴 Déconnexion:', socket.id);
    });
});

// Éboueur (Garbage Collector) pour les salons fantômes (inactifs depuis 1h)
setInterval(() => {
    const now = Date.now();
    for (const roomCode in rooms) {
        if (now - rooms[roomCode].lastActivity > 3600000) {
            delete rooms[roomCode];
        }
    }
}, 600000);

const PORT = process.env.PORT || 3000;
http.listen(PORT, () => {
    console.log(`🚀 Serveur Cache-Cache lancé sur http://localhost:${PORT}`);
});