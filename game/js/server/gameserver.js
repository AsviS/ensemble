var io = require('../../../server.js').io;
var math = require('mathjs');

gameServer = {
    lastPlayerID : 0,
    worldWidth: 2250, //px
    worldHeight: 1200, //px
    spriteWidth: 32,//px
    spriteHeight: 32, //px
    cellWidth: 40, // dimensions in px of cells of the grid
    cellHeight: 40
};

gameServer.initialize = function(){
    BlocksManager.getBlocksFromDB();
    console.log('Initialized');
};

io.on('connection',function(socket){
    socket.on('newplayer',function(){
        socket.player = gameServer.generatePlayer(); // Creates a new player object and stores it in the socket
        socket.emit('init',gameServer.generateInitPacket(socket.player.id)); // send back an initialization packet
        socket.broadcast.emit('newplayer',{
            player: socket.player,
            nbConnected: gameServer.getNbConnected()
        }); // notify the other players of the arrival of a new player

        socket.on('move',function(data){ // a player wished to move ; data.x and data.y are in px
            //if(gameServer.movePlayer(socket.player,data.x,data.y)) io.emit('move',socket.player);
            var destination = gameServer.sanitizeCoordinates(data.x,data.y); // check if coordinates are within world bounds
            MovementManager.movePlayer(socket.player,destination.x,destination.y);
        });

        socket.on('block',function(){ // a player wishes to drop a block
            var cell = gameServer.computeCellCoordinates(socket.player.x,socket.player.y);
            BlocksManager.addBlock(cell.x,cell.y);
        });

        socket.on('disconnect',function(){
            io.emit('remove',{
                id:socket.player.id,
                nbConnected: gameServer.getNbConnected()
            });
        });
    });
});

gameServer.getAllPlayers = function(){ // Iterate over the connected clients to list the players
    var players = [];
    Object.keys(io.sockets.connected).forEach(function(socketID){
        var player = io.sockets.connected[socketID].player;
        if(player) players.push(player);
    });
    return players;
};

gameServer.generatePlayer = function(){ // Create a new player object
    var startingPosition = gameServer.getStartingPosition();
    var cell = gameServer.computeCellCoordinates(startingPosition.x,startingPosition.y);
    BlocksManager.makeRoom(cell.x,cell.y); // Ensure the player doesn't start on an occupied cell or surrounded by obstacles
    return {
        id: gameServer.lastPlayerID++,
        x: startingPosition.x,
        y: startingPosition.y
    };
};

gameServer.getStartingPosition = function(){
    return {
        x: math.randomInt(gameServer.spriteWidth/2,gameServer.worldWidth-gameServer.spriteWidth),
        y: math.randomInt(gameServer.spriteHeight/2,gameServer.worldHeight-gameServer.spriteHeight)
    };
};

gameServer.generateInitPacket = function(id){ // Generate an object with a few initialization parameters for the client
  return {
        worldWidth: gameServer.worldWidth,
        worldHeight: gameServer.worldHeight,
        cellWidth: gameServer.cellWidth,
        cellHeight: gameServer.cellHeight,
        players: gameServer.getAllPlayers(),
        blocks: BlocksManager.listBlocks(),
        ownID: id,
        nbConnected: gameServer.getNbConnected()
  };
};
gameServer.sanitizeCoordinates = function(x,y){ // ensure that a pair of coordinates is not out of bounds ; coordinates in px
    return {
        x: gameServer.clamp(x,gameServer.spriteWidth/2,gameServer.worldWidth-gameServer.spriteWidth),
        y: gameServer.clamp(y,gameServer.spriteHeight/2,gameServer.worldHeight-gameServer.spriteHeight)
    };
};

gameServer.clamp = function(x,min,max){ // restricts a value to a given interval (return the value unchanged if within the interval
    return Math.max(min, Math.min(x, max));
};

gameServer.computeCellCoordinates = function(x,y){ // return the coordinates of the cell corresponding of a pair of raw coordinates
    return {
        x: Math.floor(x/gameServer.cellWidth),
        y: Math.floor(y/gameServer.cellHeight)
    };
};

gameServer.getNbConnected = function(){
    return Object.keys(io.sockets.connected).length;
};

module.exports.gameServer = gameServer;

var BlocksManager = require('./BlocksManager.js').BlocksManager;
var MovementManager = require('./MovementManager.js').MovementManager;