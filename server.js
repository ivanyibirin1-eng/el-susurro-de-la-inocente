const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const path = require('path');
const { v4: uuidv4 } = require('uuid');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

const PORT = process.env.PORT || 3000;

// Servir archivos estÃ¡ticos
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json());

// Ruta principal
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Estado global del servidor
const rooms = new Map();
const players = new Map();

// Personajes disponibles
const CHARACTERS = [
  { id: 'padre_miguel', name: 'Padre Miguel', role: 'Exorcista', sanityBase: 80, speedBase: 0.8, specialAbility: 'BendiciÃ³n Sagrada' },
  { id: 'elena', name: 'Elena', role: 'MÃ©dium', sanityBase: 60, speedBase: 1.0, specialAbility: 'VisiÃ³n Espectral' },
  { id: 'dr_vargas', name: 'Dr. Vargas', role: 'ParapsicÃ³logo', sanityBase: 90, speedBase: 0.9, specialAbility: 'AnÃ¡lisis Sobrenatural' },
  { id: 'sofia', name: 'SofÃ­a', role: 'Periodista', sanityBase: 70, speedBase: 1.1, specialAbility: 'Instinto Reportero' },
  { id: 'marco', name: 'Marco', role: 'Detective', sanityBase: 85, speedBase: 1.0, specialAbility: 'Rastreo de Pistas' }
];

// Fases del juego
const GAME_PHASES = { LOBBY: 'lobby', PLAYING: 'playing', ENDING: 'ending' };

// Tipos de puzzles
const PUZZLE_TYPES = { SWITCH: 'switch', KEY: 'key', DOOR: 'door', DIARY: 'diary' };

// Eventos de horror de Alisa
const HORROR_EVENTS = [
  { id: 'whisper', name: 'Susurro', description: 'Alisa susurra tu nombre desde las sombras', sanityDamage: 5, duration: 3000 },
  { id: 'apparition', name: 'ApariciÃ³n', description: 'La silueta de Alisa aparece frente a ti', sanityDamage: 15, duration: 5000 },
  { id: 'chase', name: 'PersecuciÃ³n', description: 'Â¡Alisa te persigue! Â¡Corre!', sanityDamage: 20, duration: 8000 },
  { id: 'possession_attempt', name: 'Intento de PosesiÃ³n', description: 'Sientes la presencia de Alisa intentando entrar en tu mente', sanityDamage: 25, duration: 6000 },
  { id: 'hallucination', name: 'AlucinaciÃ³n', description: 'La realidad se distorsiona a tu alrededor', sanityDamage: 10, duration: 4000 },
  { id: 'cold_breath', name: 'Aliento FrÃ­o', description: 'Un frÃ­o sobrenatural recorre tu espalda', sanityDamage: 3, duration: 2000 },
  { id: 'mirror_face', name: 'Cara en el Espejo', description: 'El rostro de Alisa aparece reflejado en el espejo', sanityDamage: 12, duration: 4000 },
  { id: 'lights_out', name: 'ApagÃ³n', description: 'Todas las luces se apagan repentinamente', sanityDamage: 8, duration: 5000 },
  { id: 'blood_writing', name: 'Escritura de Sangre', description: 'Palabras aparecen escritas en sangre en la pared', sanityDamage: 18, duration: 6000 },
  { id: 'mass_event', name: 'Terror Masivo', description: 'Alisa se manifiesta ante todos', sanityDamage: 30, duration: 10000 }
];

// Puzzles del juego
const GAME_PUZZLES = [
  { id: 'switch_chapel', type: PUZZLE_TYPES.SWITCH, name: 'Interruptores de la Capilla', location: 'chapel', solved: false, required: ['switch1', 'switch2', 'switch3'], hint: 'El orden de las velas revela la secuencia' },
  { id: 'key_basement', type: PUZZLE_TYPES.KEY, name: 'Llave del SÃ³tano', location: 'basement', solved: false, keyId: 'basement_key', hint: 'La llave cuelga donde el inocente rezÃ³ por Ãºltima vez' },
  { id: 'door_attic', type: PUZZLE_TYPES.DOOR, name: 'Puerta del Ãtico', location: 'attic', solved: false, requiredKey: 'attic_key', hint: 'Tres cerraduras, tres verdades ocultas' },
  { id: 'diary_alisa_1', type: PUZZLE_TYPES.DIARY, name: 'Diario de Alisa - PÃ¡gina 1', location: 'bedroom', solved: false, content: 'Hoy vi algo en el espejo que no deberÃ­a existir...', hint: 'Las pÃ¡ginas del diario revelan la verdad' },
  { id: 'diary_alisa_2', type: PUZZLE_TYPES.DIARY, name: 'Diario de Alisa - PÃ¡gina 2', location: 'library', solved: false, content: 'Madre dice que es mi imaginaciÃ³n, pero yo sÃ© lo que vi...', hint: 'Busca entre los libros olvidados' },
  { id: 'diary_alisa_3', type: PUZZLE_TYPES.DIARY, name: 'Diario de Alisa - PÃ¡gina 3', location: 'garden', solved: false, content: 'Ya no tengo miedo. Ella me enseÃ±Ã³ el camino...', hint: 'El jardÃ­n guarda el Ãºltimo secreto' },
  { id: 'switch_ritual', type: PUZZLE_TYPES.SWITCH, name: 'Ritual de PurificaciÃ³n', location: 'ritual_room', solved: false, required: ['candle1', 'candle2', 'candle3', 'candle4', 'candle5'], hint: 'Enciende las velas en el orden correcto' },
  { id: 'key_final', type: PUZZLE_TYPES.KEY, name: 'Llave Final', location: 'chapel_altar', solved: false, keyId: 'final_key', hint: 'La fe es la Ãºltima llave' }
];

// FunciÃ³n para crear una sala
function createRoom(roomName, hostPlayerId) {
  const roomId = uuidv4();
  const room = {
    id: roomId,
    name: roomName,
    host: hostPlayerId,
    players: new Map(),
    phase: GAME_PHASES.LOBBY,
    createdAt: Date.now(),
    maxPlayers: 5,
    puzzles: JSON.parse(JSON.stringify(GAME_PUZZLES)),
    collectedItems: [],
    solvedPuzzleCount: 0,
    totalPuzzles: GAME_PUZZLES.length,
    alisaActivity: 0,
    alisaLocation: null,
    gameStartTime: null,
    gameEndTime: null,
    endingType: null,
    horrorEventTimer: null,
    alisaTimer: null,
    chatHistory: [],
    gameLog: []
  };
  rooms.set(roomId, room);
  console.log(`[SALA] Nueva sala creada: "${roomName}" (ID: ${roomId}) por jugador ${hostPlayerId}`);
  return room;
}

// FunciÃ³n para obtener datos de sala seguros (sin objetos internos)
function getRoomData(room) {
  return {
    id: room.id,
    name: room.name,
    host: room.host,
    phase: room.phase,
    playerCount: room.players.size,
    maxPlayers: room.maxPlayers,
    createdAt: room.createdAt,
    puzzleProgress: `${room.solvedPuzzleCount}/${room.totalPuzzles}`,
    alisaActivity: room.alisaActivity
  };
}

// FunciÃ³n para obtener lista de jugadores en sala
function getRoomPlayers(room) {
  const playerList = [];
  room.players.forEach((playerData, playerId) => {
    playerList.push({
      id: playerId,
      name: playerData.name,
      character: playerData.character,
      isHost: playerId === room.host,
      isReady: playerData.isReady,
      sanity: playerData.sanity,
      position: playerData.position,
      rotation: playerData.rotation,
      isAlive: playerData.isAlive
    });
  });
  return playerList;
}

// FunciÃ³n para enviar mensaje a todos en una sala
function broadcastToRoom(roomId, message, excludePlayerId = null) {
  const room = rooms.get(roomId);
  if (!room) return;
  const messageStr = JSON.stringify(message);
  room.players.forEach((playerData, playerId) => {
    if (playerId === excludePlayerId) return;
    const playerWs = players.get(playerId);
    if (playerWs && playerWs.readyState === WebSocket.OPEN) {
      playerWs.send(messageStr);
    }
  });
}

// FunciÃ³n para enviar mensaje a un jugador especÃ­fico
function sendToPlayer(playerId, message) {
  const ws = players.get(playerId);
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(message));
  }
}

// Sistema de IA de Alisa - Eventos de horror
function startAlisaAI(roomId) {
  const room = rooms.get(roomId);
  if (!room) return;

  console.log(`[ALISA] Sistema de horror activado para sala ${roomId}`);

  // Timer de actividad de Alisa
  room.alisaTimer = setInterval(() => {
    const currentRoom = rooms.get(roomId);
    if (!currentRoom || currentRoom.phase !== GAME_PHASES.PLAYING) {
      clearInterval(room.alisaTimer);
      return;
    }

    // Incrementar actividad de Alisa con el tiempo
    const elapsedMinutes = (Date.now() - currentRoom.gameStartTime) / 60000;
    currentRoom.alisaActivity = Math.min(100, Math.floor(elapsedMinutes * 10));

    // Enviar actualizaciÃ³n de actividad
    broadcastToRoom(roomId, {
      type: 'alisa_activity_update',
      activity: currentRoom.alisaActivity
    });
  }, 30000);

  // Timer de eventos de horror
  scheduleHorrorEvent(roomId);
}

function scheduleHorrorEvent(roomId) {
  const room = rooms.get(roomId);
  if (!room) return;

  // Calcular tiempo hasta prÃ³ximo evento basado en actividad de Alisa
  const baseDelay = 30000; // 30 segundos base
  const activityFactor = Math.max(0.3, 1 - (room.alisaActivity / 150));
  const delay = baseDelay * activityFactor + Math.random() * 20000;

  room.horrorEventTimer = setTimeout(() => {
    const currentRoom = rooms.get(roomId);
    if (!currentRoom || currentRoom.phase !== GAME_PHASES.PLAYING) return;
    if (currentRoom.players.size === 0) return;

    triggerHorrorEvent(roomId);
    scheduleHorrorEvent(roomId);
  }, delay);
}

function triggerHorrorEvent(roomId) {
  const room = rooms.get(roomId);
  if (!room) return;

  const alivePlayers = [];
  room.players.forEach((playerData, playerId) => {
    if (playerData.isAlive) alivePlayers.push(playerId);
  });

  if (alivePlayers.length === 0) return;

  // Seleccionar tipo de evento
  let eventPool = HORROR_EVENTS.filter(e => e.id !== 'mass_event');
  
  // Evento masivo con baja probabilidad
  if (Math.random() < 0.1) {
    const massEvent = HORROR_EVENTS.find(e => e.id === 'mass_event');
    
    // Aplicar a todos los jugadores
    room.players.forEach((playerData, playerId) => {
      if (!playerData.isAlive) return;
      playerData.sanity = Math.max(0, playerData.sanity - massEvent.sanityDamage);
      
      sendToPlayer(playerId, {
        type: 'horror_event',
        event: massEvent,
        newSanity: playerData.sanity,
        target: 'all'
      });

      if (playerData.sanity === 0) {
        handlePlayerMadness(roomId, playerId);
      }
    });

    broadcastToRoom(roomId, {
      type: 'alisa_manifestation',
      message: 'Â¡ALISA SE MANIFIESTA ANTE TODOS!',
      event: massEvent
    });

    console.log(`[ALISA] Evento masivo activado en sala ${roomId}`);
    return;
  }

  // Evento individual
  const event = eventPool[Math.floor(Math.random() * eventPool.length)];
  const targetPlayerId = alivePlayers[Math.floor(Math.random() * alivePlayers.length)];
  const targetPlayer = room.players.get(targetPlayerId);

  if (!targetPlayer) return;

  // Reducir daÃ±o de cordura segÃºn habilidad del personaje
  let sanityDamage = event.sanityDamage;
  if (targetPlayer.character === 'padre_miguel') sanityDamage = Math.floor(sanityDamage * 0.7);
  if (targetPlayer.character === 'dr_vargas') sanityDamage = Math.floor(sanityDamage * 0.8);

  targetPlayer.sanity = Math.max(0, targetPlayer.sanity - sanityDamage);

  sendToPlayer(targetPlayerId, {
    type: 'horror_event',
    event: event,
    newSanity: targetPlayer.sanity,
    target: 'self'
  });

  // Notificar a otros jugadores del evento
  broadcastToRoom(roomId, {
    type: 'player_horror_event',
    targetPlayerId: targetPlayerId,
    targetName: targetPlayer.name,
    eventName: event.name,
    newSanity: targetPlayer.sanity
  }, targetPlayerId);

  console.log(`[ALISA] Evento "${event.name}" aplicado a ${targetPlayer.name} en sala ${roomId}. Cordura: ${targetPlayer.sanity}`);

  if (targetPlayer.sanity === 0) {
    handlePlayerMadness(roomId, targetPlayerId);
  }
}

function handlePlayerMadness(roomId, playerId) {
  const room = rooms.get(roomId);
  if (!room) return;

  const player = room.players.get(playerId);
  if (!player) return;

  player.isAlive = false;
  console.log(`[JUEGO] ${player.name} ha perdido la cordura en sala ${roomId}`);

  broadcastToRoom(roomId, {
    type: 'player_madness',
    playerId: playerId,
    playerName: player.name,
    message: `${player.name} ha sucumbido a la locura. Alisa se lleva su cordura...`
  });

  // Verificar si todos los jugadores han perdido la cordura
  let allMad = true;
  room.players.forEach((playerData) => {
    if (playerData.isAlive) allMad = false;
  });

  if (allMad) {
    endGame(roomId, 'all_mad');
  }
}

function stopAlisaAI(roomId) {
  const room = rooms.get(roomId);
  if (!room) return;

  if (room.horrorEventTimer) {
    clearTimeout(room.horrorEventTimer);
    room.horrorEventTimer = null;
  }
  if (room.alisaTimer) {
    clearInterval(room.alisaTimer);
    room.alisaTimer = null;
  }
  console.log(`[ALISA] Sistema de horror detenido para sala ${roomId}`);
}

// Iniciar el juego
function startGame(roomId) {
  const room = rooms.get(roomId);
  if (!room) return;

  room.phase = GAME_PHASES.PLAYING;
  room.gameStartTime = Date.now();
  room.puzzles = JSON.parse(JSON.stringify(GAME_PUZZLES));
  room.solvedPuzzleCount = 0;
  room.collectedItems = [];

  // Resetear estado de jugadores
  room.players.forEach((playerData) => {
    const character = CHARACTERS.find(c => c.id === playerData.character);
    playerData.sanity = character ? character.sanityBase : 100;
    playerData.isAlive = true;
    playerData.collectedItems = [];
    playerData.position = { x: 0, y: 0, z: 0 };
    playerData.rotation = { x: 0, y: 0, z: 0 };
  });

  console.log(`[JUEGO] Â¡Juego iniciado en sala "${room.name}" (${roomId})! Jugadores: ${room.players.size}`);

  broadcastToRoom(roomId, {
    type: 'game_start',
    roomId: roomId,
    puzzles: room.puzzles.map(p => ({ id: p.id, type: p.type, name: p.name, location: p.location, solved: p.solved, hint: p.hint })),
    players: getRoomPlayers(room),
    message: 'El juego ha comenzado. La presencia de Alisa se siente en cada rincÃ³n...'
  });

  startAlisaAI(roomId);
}

// Finalizar el juego
function endGame(roomId, reason) {
  const room = rooms.get(roomId);
  if (!room) return;

  stopAlisaAI(roomId);

  room.phase = GAME_PHASES.ENDING;
  room.gameEndTime = Date.now();
  room.endingType = reason;

  const duration = Math.floor((room.gameEndTime - room.gameStartTime) / 1000);
  const minutes = Math.floor(duration / 60);
  const seconds = duration % 60;

  let endMessage = '';
  let isVictory = false;

  switch (reason) {
    case 'puzzles_complete':
      endMessage = 'Â¡VICTORIA! Los investigadores han completado todos los rituales y liberado el alma de Alisa. La inocente finalmente descansa en paz.';
      isVictory = true;
      break;
    case 'all_mad':
      endMessage = 'DERROTA. Alisa ha consumido la cordura de todos los investigadores. Sus almas ahora vagan eternamente junto a ella.';
      isVictory = false;
      break;
    case 'time_up':
      endMessage = 'TIEMPO AGOTADO. Alisa ha ganado. El horror continÃºa en la mansiÃ³n...';
      isVictory = false;
      break;
    default:
      endMessage = 'El juego ha terminado.';
  }

  console.log(`[JUEGO] Juego terminado en sala ${roomId}. RazÃ³n: ${reason}. DuraciÃ³n: ${minutes}m ${seconds}s`);

  broadcastToRoom(roomId, {
    type: 'game_end',
    reason: reason,
    isVictory: isVictory,
    message: endMessage,
    duration: { minutes, seconds },
    solvedPuzzles: room.solvedPuzzleCount,
    totalPuzzles: room.totalPuzzles,
    finalStats: getFinalStats(room)
  });

  // Resetear sala al lobby despuÃ©s de 30 segundos
  setTimeout(() => {
    const currentRoom = rooms.get(roomId);
    if (currentRoom) {
      currentRoom.phase = GAME_PHASES.LOBBY;
      currentRoom.puzzles = JSON.parse(JSON.stringify(GAME_PUZZLES));
      currentRoom.solvedPuzzleCount = 0;
      currentRoom.alisaActivity = 0;
      currentRoom.players.forEach((playerData) => {
        playerData.isReady = false;
        playerData.isAlive = true;
        const character = CHARACTERS.find(c => c.id === playerData.character);
        playerData.sanity = character ? character.sanityBase : 100;
      });
      broadcastToRoom(roomId, {
        type: 'room_reset',
        message: 'La sala ha sido reiniciada. PodÃ©is jugar otra partida.',
        players: getRoomPlayers(currentRoom)
      });
      console.log(`[SALA] Sala ${roomId} reiniciada al lobby`);
    }
  }, 30000);
}

function getFinalStats(room) {
  const stats = [];
  room.players.forEach((playerData, playerId) => {
    stats.push({
      id: playerId,
      name: playerData.name,
      character: playerData.character,
      finalSanity: playerData.sanity,
      survived: playerData.isAlive
    });
  });
  return stats;
}

// Manejar progreso de puzzle
function handlePuzzleProgress(roomId, playerId, puzzleId, action, data) {
  const room = rooms.get(roomId);
  if (!room || room.phase !== GAME_PHASES.PLAYING) return;

  const puzzle = room.puzzles.find(p => p.id === puzzleId);
  if (!puzzle || puzzle.solved) return;

  const player = room.players.get(playerId);
  if (!player) return;

  let puzzleSolved = false;

  switch (puzzle.type) {
    case PUZZLE_TYPES.SWITCH:
      if (!puzzle.activatedSwitches) puzzle.activatedSwitches = [];
      if (action === 'activate' && data.switchId) {
        if (!puzzle.activatedSwitches.includes(data.switchId)) {
          puzzle.activatedSwitches.push(data.switchId);
        }
        // Comprobar si todos los switches necesarios estÃ¡n activados
        const allActivated = puzzle.required.every(s => puzzle.activatedSwitches.includes(s));
        if (allActivated) puzzleSolved = true;
      }
      break;

    case PUZZLE_TYPES.KEY:
      if (action === 'collect') {
        if (!room.collectedItems.includes(puzzle.keyId)) {
          room.collectedItems.push(puzzle.keyId);
          if (!player.collectedItems) player.collectedItems = [];
          player.collectedItems.push(puzzle.keyId);
          
          broadcastToRoom(roomId, {
            type: 'item_collected',
            playerId: playerId,
            playerName: player.name,
            itemId: puzzle.keyId,
            puzzleId: puzzle.id
          });
        }
      } else if (action === 'use') {
        if (room.collectedItems.includes(puzzle.keyId) || (player.collectedItems && player.collectedItems.includes(puzzle.keyId))) {
          puzzleSolved = true;
        }
      }
      break;

    case PUZZLE_TYPES.DOOR:
      if (action === 'unlock') {
        const hasKey = room.collectedItems.includes(puzzle.requiredKey) ||
                       (player.collectedItems && player.collectedItems.includes(puzzle.requiredKey));
        if (hasKey) puzzleSolved = true;
        else {
          sendToPlayer(playerId, {
            type: 'puzzle_feedback',
            puzzleId: puzzleId,
            success: false,
            message: 'Necesitas la llave correcta para abrir esta puerta.'
          });
        }
      }
      break;

    case PUZZLE_TYPES.DIARY:
      if (action === 'read') {
        puzzleSolved = true;
        sendToPlayer(playerId, {
          type: 'diary_content',
          puzzleId: puzzleId,
          content: puzzle.content,
          pageName: puzzle.name
        });
      }
      break;
  }

  // Broadcast de progreso del puzzle
  broadcastToRoom(roomId, {
    type: 'puzzle_progress',
    puzzleId: puzzleId,
    playerId: playerId,
    playerName: player.name,
    action: action,
    puzzleData: puzzle
  });

  if (puzzleSolved) {
    puzzle.solved = true;
    puzzle.solvedBy = playerId;
    puzzle.solvedAt = Date.now();
    room.solvedPuzzleCount++;

    console.log(`[PUZZLE] "${puzzle.name}" resuelto por ${player.name} en sala ${roomId}. Progreso: ${room.solvedPuzzleCount}/${room.totalPuzzles}`);

    // Otorgar cordura bonus por resolver puzzle
    player.sanity = Math.min(100, player.sanity + 10);

    broadcastToRoom(roomId, {
      type: 'puzzle_solved',
      puzzleId: puzzleId,
      puzzleName: puzzle.name,
      solvedBy: playerId,
      solvedByName: player.name,
      solvedPuzzles: room.solvedPuzzleCount,
      totalPuzzles: room.totalPuzzles,
      playerSanity: player.sanity,
      message: `Â¡${player.name} ha resuelto "${puzzle.name}"! (+10 cordura)`
    });

    // Verificar victoria
    if (room.solvedPuzzleCount >= room.totalPuzzles) {
      setTimeout(() => endGame(roomId, 'puzzles_complete'), 3000);
    }

    // Actividad de Alisa aumenta al resolver puzzles
    room.alisaActivity = Math.min(100, room.alisaActivity + 15);
    broadcastToRoom(roomId, {
      type: 'alisa_rage',
      message: 'Alisa siente que se acercan a la verdad... Su furia crece',
      activity: room.alisaActivity
    });
  }
}

// Manejador de conexiones WebSocket
wss.on('connection', (ws, req) => {
  const playerId = uuidv4();
  players.set(playerId, ws);
  ws.playerId = playerId;
  ws.roomId = null;

  console.log(`[CONEXIÃN] Nuevo jugador conectado: ${playerId} (Total: ${players.size})`);

  // Enviar ID al jugador
  ws.send(JSON.stringify({
    type: 'connected',
    playerId: playerId,
    message: 'Conectado al servidor de El Susurro de la Inocente',
    availableCharacters: CHARACTERS
  }));

  // Manejar mensajes
  ws.on('message', (data) => {
    let message;
    try {
      message = JSON.parse(data);
    } catch (e) {
      console.error(`[ERROR] Mensaje invÃ¡lido de ${playerId}:`, e.message);
      ws.send(JSON.stringify({ type: 'error', message: 'Formato de mensaje invÃ¡lido' }));
      return;
    }

    handleMessage(ws, playerId, message);
  });

  // Manejar desconexiÃ³n
  ws.on('close', () => {
    handleDisconnect(playerId);
  });

  ws.on('error', (error) => {
    console.error(`[ERROR] Error en WebSocket de ${playerId}:`, error.message);
    handleDisconnect(playerId);
  });
});

function handleMessage(ws, playerId, message) {
  const { type } = message;

  switch (type) {
    // ==================== GESTIÃN DE SALAS ====================
    case 'create_room': {
      const { roomName, playerName, character } = message;

      if (!roomName || roomName.trim().length < 1) {
        ws.send(JSON.stringify({ type: 'error', message: 'El nombre de la sala es requerido' }));
        return;
      }
      if (!playerName || playerName.trim().length < 1) {
        ws.send(JSON.stringify({ type: 'error', message: 'El nombre del jugador es requerido' }));
        return;
      }

      // Salir de sala anterior si existe
      if (ws.roomId) handleLeaveRoom(playerId, ws.roomId);

      const room = createRoom(roomName.trim(), playerId);
      const selectedCharacter = CHARACTERS.find(c => c.id === character) || CHARACTERS[0];

      const playerData = {
        name: playerName.trim(),
        character: selectedCharacter.id,
        isReady: false,
        sanity: selectedCharacter.sanityBase,
        isAlive: true,
        position: { x: 0, y: 0, z: 0 },
        rotation: { x: 0, y: 0, z: 0 },
        collectedItems: [],
        joinedAt: Date.now()
      };

      room.players.set(playerId, playerData);
      ws.roomId = room.id;

      ws.send(JSON.stringify({
        type: 'room_created',
        room: getRoomData(room),
        players: getRoomPlayers(room),
        yourCharacter: selectedCharacter,
        message: `Sala "${room.name}" creada exitosamente`
      }));

      console.log(`[SALA] ${playerName} creÃ³ y se uniÃ³ a la sala "${room.name}"`);
      break;
    }

    case 'join_room': {
      const { roomId, playerName, character } = message;

      const room = rooms.get(roomId);
      if (!room) {
        ws.send(JSON.stringify({ type: 'error', message: 'La sala no existe' }));
        return;
      }
      if (room.players.size >= room.maxPlayers) {
        ws.send(JSON.stringify({ type: 'error', message: 'La sala estÃ¡ llena (mÃ¡ximo 5 jugadores)' }));
        return;
      }
      if (room.phase !== GAME_PHASES.LOBBY) {
        ws.send(JSON.stringify({ type: 'error', message: 'No puedes unirte a una partida en curso' }));
        return;
      }
      if (!playerName || playerName.trim().length < 1) {
        ws.send(JSON.stringify({ type: 'error', message: 'El nombre del jugador es requerido' }));
        return;
      }

      // Verificar personaje no duplicado
      const selectedCharacter = CHARACTERS.find(c => c.id === character) || CHARACTERS[0];
      let charToUse = selectedCharacter;
      let charInUse = false;
      room.players.forEach((pd) => {
        if (pd.character === selectedCharacter.id) charInUse = true;
      });
      if (charInUse) {
        // Asignar personaje libre
        const usedChars = new Set();
        room.players.forEach((pd) => usedChars.add(pd.character));
        const freeChar = CHARACTERS.find(c => !usedChars.has(c.id));
        charToUse = freeChar || CHARACTERS[0];
      }

      if (ws.roomId) handleLeaveRoom(playerId, ws.roomId);

      const playerData = {
        name: playerName.trim(),
        character: charToUse.id,
        isReady: false,
        sanity: charToUse.sanityBase,
        isAlive: true,
        position: { x: 0, y: 0, z: 0 },
        rotation: { x: 0, y: 0, z: 0 },
        collectedItems: [],
        joinedAt: Date.now()
      };

      room.players.set(playerId, playerData);
      ws.roomId = room.id;

      // Notificar al que se uniÃ³
      ws.send(JSON.stringify({
        type: 'room_joined',
        room: getRoomData(room),
        players: getRoomPlayers(room),
        yourCharacter: charToUse,
        message: `Te uniste a la sala "${room.name}"`
      }));

      // Notificar a los demÃ¡s
      broadcastToRoom(roomId, {
        type: 'player_joined',
        playerId: playerId,
        playerName: playerName.trim(),
        character: charToUse,
        players: getRoomPlayers(room),
        message: `${playerName.trim()} se ha unido usando el personaje ${charToUse.name}`
      }, playerId);

      console.log(`[SALA] ${playerName} se uniÃ³ a la sala "${room.name}" como ${charToUse.name}`);
      break;
    }

    case 'leave_room': {
      if (ws.roomId) {
        handleLeaveRoom(playerId, ws.roomId);
        ws.roomId = null;
        ws.send(JSON.stringify({ type: 'room_left', message: 'Has abandonado la sala' }));
      }
      break;
    }

    case 'list_rooms': {
      const roomList = [];
      rooms.forEach((room) => {
        if (room.phase === GAME_PHASES.LOBBY) {
          roomList.push(getRoomData(room));
        }
      });
      ws.send(JSON.stringify({
        type: 'rooms_list',
        rooms: roomList,
        count: roomList.length
      }));
      break;
    }

    case 'get_room_info': {
      const { roomId } = message;
      const room = rooms.get(roomId || ws.roomId);
      if (!room) {
        ws.send(JSON.stringify({ type: 'error', message: 'Sala no encontrada' }));
        return;
      }
      ws.send(JSON.stringify({
        type: 'room_info',
        room: getRoomData(room),
        players: getRoomPlayers(room),
        puzzles: room.puzzles ? room.puzzles.map(p => ({ id: p.id, type: p.type, name: p.name, location: p.location, solved: p.solved, hint: p.hint })) : []
      }));
      break;
    }

    // ==================== SELECCIÃN DE PERSONAJE ====================
    case 'select_character': {
      const { character } = message;
      const roomId = ws.roomId;
      if (!roomId) {
        ws.send(JSON.stringify({ type: 'error', message: 'No estÃ¡s en ninguna sala' }));
        return;
      }
      const room = rooms.get(roomId);
      if (!room || room.phase !== GAME_PHASES.LOBBY) return;

      const selectedChar = CHARACTERS.find(c => c.id === character);
      if (!selectedChar) {
        ws.send(JSON.stringify({ type: 'error', message: 'Personaje no vÃ¡lido' }));
        return;
      }

      // Verificar si el personaje estÃ¡ disponible
      let charInUse = false;
      room.players.forEach((pd, pid) => {
        if (pd.character === character && pid !== playerId) charInUse = true;
      });

      if (charInUse) {
        ws.send(JSON.stringify({ type: 'error', message: `${selectedChar.name} ya estÃ¡ en uso por otro jugador` }));
        return;
      }

      const player = room.players.get(playerId);
      if (player) {
        player.character = selectedChar.id;
        player.sanity = selectedChar.sanityBase;

        ws.send(JSON.stringify({
          type: 'character_selected',
          character: selectedChar,
          message: `Has seleccionado a ${selectedChar.name}`
        }));

        broadcastToRoom(roomId, {
          type: 'player_character_changed',
          playerId: playerId,
          playerName: player.name,
          character: selectedChar,
          players: getRoomPlayers(room)
        }, playerId);

        console.log(`[PERSONAJE] ${player.name} seleccionÃ³ a ${selectedChar.name}`);
      }
      break;
    }

    // ==================== ESTADO DEL JUGADOR ====================
    case 'player_ready': {
      const roomId = ws.roomId;
      if (!roomId) return;
      const room = rooms.get(roomId);
      if (!room || room.phase !== GAME_PHASES.LOBBY) return;

      const player = room.players.get(playerId);
      if (player) {
        player.isReady = !player.isReady;
        
        broadcastToRoom(roomId, {
          type: 'player_ready_status',
          playerId: playerId,
          playerName: player.name,
          isReady: player.isReady,
          players: getRoomPlayers(room)
        });

        // Verificar si todos estÃ¡n listos
        if (room.players.size >= 2) {
          let allReady = true;
          room.players.forEach((pd) => { if (!pd.isReady) allReady = false; });
          if (allReady && room.host === playerId) {
            console.log(`[SALA] Todos los jugadores listos en sala ${roomId}`);
          }
        }
        console.log(`[SALA] ${player.name} ${player.isReady ? 'estÃ¡ listo' : 'no estÃ¡ listo'}`);
      }
      break;
    }

    case 'update_position': {
      const { position, rotation } = message;
      const roomId = ws.roomId;
      if (!roomId) return;
      const room = rooms.get(roomId);
      if (!room || room.phase !== GAME_PHASES.PLAYING) return;

      const player = room.players.get(playerId);
      if (player && player.isAlive) {
        player.position = position;
        player.rotation = rotation;

        broadcastToRoom(roomId, {
          type: 'player_moved',
          playerId: playerId,
          position: position,
          rotation: rotation
        }, playerId);
      }
      break;
    }

    case 'update_sanity': {
      const { sanity, reason } = message;
      const roomId = ws.roomId;
      if (!roomId) return;
      const room = rooms.get(roomId);
      if (!room || room.phase !== GAME_PHASES.PLAYING) return;

      const player = room.players.get(playerId);
      if (player) {
        player.sanity = Math.max(0, Math.min(100, sanity));

        broadcastToRoom(roomId, {
          type: 'player_sanity_update',
          playerId: playerId,
          playerName: player.name,
          sanity: player.sanity,
          reason: reason || 'desconocido'
        });

        if (player.sanity === 0 && player.isAlive) {
          handlePlayerMadness(roomId, playerId);
        }
      }
      break;
    }

    // ==================== CONTROL DE JUEGO ====================
    case 'start_game': {
      const roomId = ws.roomId;
      if (!roomId) {
        ws.send(JSON.stringify({ type: 'error', message: 'No estÃ¡s en ninguna sala' }));
        return;
      }
      const room = rooms.get(roomId);
      if (!room) return;

      if (room.host !== playerId) {
        ws.send(JSON.stringify({ type: 'error', message: 'Solo el anfitriÃ³n puede iniciar el juego' }));
        return;
      }
      if (room.players.size < 1) {
        ws.send(JSON.stringify({ type: 'error', message: 'Se necesita al menos 1 jugador para iniciar' }));
        return;
      }
      if (room.phase !== GAME_PHASES.LOBBY) {
        ws.send(JSON.stringify({ type: 'error', message: 'El juego ya estÃ¡ en curso' }));
        return;
      }

      startGame(roomId);
      break;
    }

    case 'force_end_game': {
      const roomId = ws.roomId;
      if (!roomId) return;
      const room = rooms.get(roomId);
      if (!room) return;

      if (room.host !== playerId) {
        ws.send(JSON.stringify({ type: 'error', message: 'Solo el anfitriÃ³n puede terminar el juego' }));
        return;
      }

      endGame(roomId, 'host_ended');
      console.log(`[JUEGO] El anfitriÃ³n terminÃ³ el juego manualmente en sala ${roomId}`);
      break;
    }

    // ==================== PUZZLES ====================
    case 'puzzle_action': {
      const { puzzleId, action, data } = message;
      const roomId = ws.roomId;
      if (!roomId) return;

      handlePuzzleProgress(roomId, playerId, puzzleId, action, data || {});
      break;
    }

    case 'request_hint': {
      const { puzzleId } = message;
      const roomId = ws.roomId;
      if (!roomId) return;
      const room = rooms.get(roomId);
      if (!room) return;

      const puzzle = room.puzzles.find(p => p.id === puzzleId);
      if (puzzle && !puzzle.solved) {
        ws.send(JSON.stringify({
          type: 'puzzle_hint',
          puzzleId: puzzleId,
          hint: puzzle.hint
        }));
      }
      break;
    }

    case 'collect_item': {
      const { itemId, puzzleId } = message;
      const roomId = ws.roomId;
      if (!roomId) return;

      handlePuzzleProgress(roomId, playerId, puzzleId, 'collect', { itemId });
      break;
    }

    // ==================== CHAT ====================
    case 'chat_message': {
      const { text } = message;
      const roomId = ws.roomId;
      if (!roomId) {
        ws.send(JSON.stringify({ type: 'error', message: 'No estÃ¡s en ninguna sala' }));
        return;
      }
      if (!text || text.trim().length === 0) return;
      if (text.trim().length > 300) {
        ws.send(JSON.stringify({ type: 'error', message: 'El mensaje es demasiado largo (mÃ¡x. 300 caracteres)' }));
        return;
      }

      const room = rooms.get(roomId);
      if (!room) return;

      const player = room.players.get(playerId);
      if (!player) return;

      const chatMsg = {
        id: uuidv4(),
        playerId: playerId,
        playerName: player.name,
        character: player.character,
        text: text.trim(),
        timestamp: Date.now()
      };

      // Guardar en historial (mÃ¡x 100 mensajes)
      room.chatHistory.push(chatMsg);
      if (room.chatHistory.length > 100) room.chatHistory.shift();

      broadcastToRoom(roomId, {
        type: 'chat_message',
        message: chatMsg
      });
      break;
    }

    case 'get_chat_history': {
      const roomId = ws.roomId;
      if (!roomId) return;
      const room = rooms.get(roomId);
      if (!room) return;

      ws.send(JSON.stringify({
        type: 'chat_history',
        messages: room.chatHistory
      }));
      break;
    }

    // ==================== EVENTOS DE HORROR ====================
    case 'trigger_horror_event': {
      // Solo el servidor deberÃ­a hacer esto, pero permitimos que el host lo haga manualmente
      const roomId = ws.roomId;
      if (!roomId) return;
      const room = rooms.get(roomId);
      if (!room || room.host !== playerId) return;
      if (room.phase !== GAME_PHASES.PLAYING) return;

      triggerHorrorEvent(roomId);
      break;
    }

    case 'sanity_help': {
      // Un jugador ayuda a otro con la cordura (habilidad de Padre Miguel)
      const { targetPlayerId, amount } = message;
      const roomId = ws.roomId;
      if (!roomId) return;
      const room = rooms.get(roomId);
      if (!room || room.phase !== GAME_PHASES.PLAYING) return;

      const helper = room.players.get(playerId);
      const target = room.players.get(targetPlayerId);

      if (!helper || !target) return;
      if (helper.character !== 'padre_miguel') {
        ws.send(JSON.stringify({ type: 'error', message: 'Solo el Padre Miguel puede usar esta habilidad' }));
        return;
      }

      const healAmount = Math.min(amount || 15, 15);
      target.sanity = Math.min(100, target.sanity + healAmount);
      helper.sanity = Math.max(0, helper.sanity - 5); // Cuesta cordura ayudar

      sendToPlayer(targetPlayerId, {
        type: 'sanity_restored',
        amount: healAmount,
        helperName: helper.name,
        newSanity: target.sanity,
        message: `${helper.name} te ha ayudado a recuperar ${healAmount} puntos de cordura`
      });

      ws.send(JSON.stringify({
        type: 'sanity_help_sent',
        targetName: target.name,
        amount: healAmount,
        yourNewSanity: helper.sanity
      }));

      broadcastToRoom(roomId, {
        type: 'sanity_help_event',
        helperName: helper.name,
        targetName: target.name,
        amount: healAmount
      });

      console.log(`[HABILIDAD] ${helper.name} ayudÃ³ a ${target.name} con ${healAmount} de cordura`);
      break;
    }

    case 'use_ability': {
      const { abilityTarget } = message;
      const roomId = ws.roomId;
      if (!roomId) return;
      const room = rooms.get(roomId);
      if (!room || room.phase !== GAME_PHASES.PLAYING) return;

      const player = room.players.get(playerId);
      if (!player) return;

      let abilityEffect = {};

      switch (player.character) {
        case 'elena':
          // VisiÃ³n Espectral - revelar ubicaciÃ³n de Alisa
          abilityEffect = {
            type: 'ability_used',
            character: 'elena',
            abilityName: 'VisiÃ³n Espectral',
            effect: 'alisa_revealed',
            alisaLocation: `Sector ${Math.floor(Math.random() * 6) + 1}`,
            message: `${player.name} usa VisiÃ³n Espectral y siente la presencia de Alisa`
          };
          break;
        case 'dr_vargas':
          // AnÃ¡lisis Sobrenatural - reducir tiempo de prÃ³ximo evento
          abilityEffect = {
            type: 'ability_used',
            character: 'dr_vargas',
            abilityName: 'AnÃ¡lisis Sobrenatural',
            effect: 'horror_delayed',
            message: `${player.name} usa AnÃ¡lisis Sobrenatural y aleja temporalmente a Alisa`
          };
          // Reducir actividad de Alisa
          room.alisaActivity = Math.max(0, room.alisaActivity - 20);
          break;
        case 'sofia':
          // Instinto Reportero - obtener pista gratis
          const unsolvedPuzzles = room.puzzles.filter(p => !p.solved);
          const randomPuzzle = unsolvedPuzzles[Math.floor(Math.random() * unsolvedPuzzles.length)];
          abilityEffect = {
            type: 'ability_used',
            character: 'sofia',
            abilityName: 'Instinto Reportero',
            effect: 'hint_revealed',
            hint: randomPuzzle ? randomPuzzle.hint : 'No hay mÃ¡s pistas disponibles',
            puzzleId: randomPuzzle ? randomPuzzle.id : null,
            message: `${player.name} usa su instinto para descubrir una pista`
          };
          break;
        case 'marco':
          // Rastreo de Pistas - ver todos los objetos coleccionables
          const allItems = room.puzzles.filter(p => p.type === PUZZLE_TYPES.KEY && !p.solved);
          abilityEffect = {
            type: 'ability_used',
            character: 'marco',
            abilityName: 'Rastreo de Pistas',
            effect: 'items_revealed',
            items: allItems.map(p => ({ id: p.keyId, location: p.location, puzzleId: p.id })),
            message: `${player.name} detecta la ubicaciÃ³n de los objetos clave`
          };
          break;
        default:
          abilityEffect = {
            type: 'ability_used',
            character: player.character,
            abilityName: 'Habilidad especial',
            effect: 'none',
            message: `${player.name} usa su habilidad especial`
          };
      }

      ws.send(JSON.stringify(abilityEffect));
      broadcastToRoom(roomId, {
        ...abilityEffect,
        playerId: playerId
      }, playerId);

      console.log(`[HABILIDAD] ${player.name} usÃ³ ${CHARACTERS.find(c => c.id === player.character)?.specialAbility || 'habilidad especial'}`);
      break;
    }

    // ==================== PINGS ====================
    case 'ping': {
      ws.send(JSON.stringify({ type: 'pong', timestamp: Date.now() }));
      break;
    }

    case 'get_characters': {
      ws.send(JSON.stringify({
        type: 'characters_list',
        characters: CHARACTERS
      }));
      break;
    }

    default:
      console.warn(`[ADVERTENCIA] Tipo de mensaje desconocido: "${type}" de ${playerId}`);
      ws.send(JSON.stringify({ type: 'error', message: `Tipo de mensaje desconocido: ${type}` }));
  }
}

function handleLeaveRoom(playerId, roomId) {
  const room = rooms.get(roomId);
  if (!room) return;

  const player = room.players.get(playerId);
  const playerName = player ? player.name : 'Desconocido';

  room.players.delete(playerId);

  console.log(`[SALA] ${playerName} abandonÃ³ la sala "${room.name}" (${roomId})`);

  if (room.players.size === 0) {
    // Limpiar sala vacÃ­a
    stopAlisaAI(roomId);
    rooms.delete(roomId);
    console.log(`[SALA] Sala "${room.name}" (${roomId}) eliminada por estar vacÃ­a`);
    return;
  }

  // Transferir host si el que se fue era el anfitriÃ³n
  if (room.host === playerId) {
    const newHostId = room.players.keys().next().value;
    room.host = newHostId;
    const newHost = room.players.get(newHostId);
    console.log(`[SALA] ${newHost ? newHost.name : newHostId} es el nuevo anfitriÃ³n de "${room.name}"`);
    
    broadcastToRoom(roomId, {
      type: 'new_host',
      newHostId: newHostId,
      newHostName: newHost ? newHost.name : 'Desconocido',
      message: `${newHost ? newHost.name : 'Alguien'} es ahora el anfitriÃ³n`
    });
  }

  // Notificar a los demÃ¡s
  broadcastToRoom(roomId, {
    type: 'player_left',
    playerId: playerId,
    playerName: playerName,
    players: getRoomPlayers(room),
    message: `${playerName} ha abandonado la sala`
  });

  // Si el juego estaba en curso y queda 1 jugador, pausar
  if (room.phase === GAME_PHASES.PLAYING && room.players.size < 1) {
    endGame(roomId, 'all_left');
  }
}

function handleDisconnect(playerId) {
  const ws = players.get(playerId);
  const roomId = ws ? ws.roomId : null;

  players.delete(playerId);

  if (roomId) {
    handleLeaveRoom(playerId, roomId);
  }

  console.log(`[DESCONEXIÃN] Jugador ${playerId} desconectado. (Total: ${players.size})`);
}

// Limpieza periÃ³dica de salas inactivas
setInterval(() => {
  const now = Date.now();
  const maxAge = 2 * 60 * 60 * 1000; // 2 horas

  rooms.forEach((room, roomId) => {
    // Eliminar salas antiguas vacÃ­as
    if (room.players.size === 0 && now - room.createdAt > 60000) {
      stopAlisaAI(roomId);
      rooms.delete(roomId);
      console.log(`[LIMPIEZA] Sala vacÃ­a "${room.name}" eliminada`);
    }
    // Eliminar salas muy antiguas
    if (now - room.createdAt > maxAge) {
      stopAlisaAI(roomId);
      broadcastToRoom(roomId, { type: 'server_message', message: 'La sala ha sido cerrada por inactividad' });
      rooms.delete(roomId);
      console.log(`[LIMPIEZA] Sala antigua "${room.name}" eliminada por inactividad`);
    }
  });
}, 5 * 60 * 1000); // Cada 5 minutos

// API REST bÃ¡sica
app.get('/api/status', (req, res) => {
  res.json({
    status: 'online',
    game: 'El Susurro de la Inocente',
    players: players.size,
    rooms: rooms.size,
    uptime: process.uptime(),
    timestamp: new Date().toISOString()
  });
});

app.get('/api/rooms', (req, res) => {
  const roomList = [];
  rooms.forEach((room) => {
    roomList.push(getRoomData(room));
  });
  res.json({ rooms: roomList, count: roomList.length });
});

app.get('/api/characters', (req, res) => {
  res.json({ characters: CHARACTERS });
});

// Manejo de errores 404
app.use((req, res) => {
  res.status(404).json({ error: 'Ruta no encontrada' });
});

// Iniciar servidor
server.listen(PORT, () => {
  console.log('ââââââââââââââââââââââââââââââââââââââââââââââââââ');
  console.log('â      EL SUSURRO DE LA INOCENTE - SERVIDOR      â');
  console.log('ââââââââââââââââââââââââââââââââââââââââââââââââââ');
  console.log(`[SERVIDOR] Escuchando en puerto ${PORT}`);
  console.log(`[SERVIDOR] Archivos estÃ¡ticos desde: ./public/`);
  console.log(`[SERVIDOR] WebSocket listo para conexiones`);
  console.log(`[SERVIDOR] Personajes disponibles: ${CHARACTERS.map(c => c.name).join(', ')}`);
  console.log(`[SERVIDOR] Puzzles del juego: ${GAME_PUZZLES.length}`);
  console.log(`[SERVIDOR] Eventos de horror: ${HORROR_EVENTS.length}`);
  console.log('[SERVIDOR] Â¡El horror estÃ¡ listo para comenzar...');
});

process.on('SIGTERM', () => {
  console.log('[SERVIDOR] SeÃ±al SIGTERM recibida. Cerrando servidor...');
  rooms.forEach((room, roomId) => {
    stopAlisaAI(roomId);
    broadcastToRoom(roomId, { type: 'server_shutdown', message: 'El servidor se estÃ¡ cerrando. Por favor, reconÃ©ctate en breve.' });
  });
  server.close(() => {
    console.log('[SERVIDOR] Servidor cerrado correctamente.');
    process.exit(0);
  });
});

process.on('SIGINT', () => {
  console.log('[SERVIDOR] SeÃ±al SIGINT recibida. Cerrando servidor...');
  rooms.forEach((room, roomId) => {
    stopAlisaAI(roomId);
  });
  server.close(() => {
    console.log('[SERVIDOR] Servidor cerrado correctamente.');
    process.exit(0);
  });
});

module.exports = { app, server };
