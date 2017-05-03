/**
 * Created by Jerome on 01-05-17.
 */
var onServer = (typeof window === 'undefined');

if(onServer) {
    var io = require('../../../server.js').io; // socket.io object
    var shared = require('../shared/shared.js');
    var BlocksManager = require('./BlocksManager.js').BlocksManager;
}

// Object responsible for handling the movements of all players (checking for obstacles, broadcasting ...), be it by click or key press
MovementManager = {
    lastMove : 0, // timestamp of the last time the player moved (client-side use only)
    moveDelay: 100 //ms before allowing a new movement (client-side use only)
};

MovementManager.canMoveAgain = function(){ // check if enough time has elapsed to allow a new movement, to prevent rapid firing
    if(onServer) return;
    if(Date.now() - MovementManager.lastMove < MovementManager.moveDelay) return false;
    MovementManager.lastMove = Date.now();
    return true;
};

MovementManager.moveClientAt = function(x,y){ // Handles a change of coordinates on the client side ; coordinates in px
    if(onServer) return;
    if(!Game.allowAction) return;
    if(MovementManager.canMoveAgain()) Client.sendMovement(x,y);
};

MovementManager.tweenPlayer = function(id,x,y){ // Handles the visual aspects of player movement
    if(onServer) return;
    if(!Game.initialized) return;
    var player = Game.players[id];
    if(player.tween) player.tween.stop();
    var distance = Phaser.Math.distance(player.x,player.y,x,y);
    // The following tweens a sprite linearly from its current position to the received (x,y) coordinates
    player.tween = game.add.tween(player);
    var duration = distance*Game.spriteSpeed;
    player.tween.to({x:x,y:y}, duration,Phaser.Easing.Linear.None);
    player.tween.start();
};

MovementManager.computeMovement = function(angle){ // compute the new coordinates of the player when moving in a certain direction using keyboard
    if(onServer) return;
    if(angle == null) return;
    if(!MovementManager.canMoveAgain()) return;
    angle *= (Math.PI/180);
    var newX = Game.ownSprite.position.x + Math.cos(angle)*Game.cellWidth;
    var newY = Game.ownSprite.position.y + -Math.sin(angle)*Game.cellHeight;
    Client.sendMovement(newX,newY);
};

MovementManager.movePlayer = function(player,x,y){ // update the coordinates of a player on the server side ; coordinates are in px
    if(!onServer) return;
    // check for obstacles on the path and return the furthest reachable position
    var endPosition = MovementManager.checkObstacles({
        x:player.x, // start
        y:player.y
    }, {
        x: x, // end
        y: y
    });
    player.x = endPosition.x;
    player.y = endPosition.y;
    MovementManager.emitMove(player);
};

MovementManager.emitMove = function(player){
    if(!onServer) return;
    io.emit('move',player);
};

MovementManager.checkObstacles = function(start,end){ // coordinates in px
    // Coarse algorithm to check if an obstacle is on the trajectory (straight line from start to end coordinates).
    // It does so by splitting the path in chunks of 20 pixels, and check if the corresponding cell has a block or not.
    // If yes, returns the end coordinates in case of "hitting" the obstacle; if no, return the intended end coordinates.
    var chunkLength = 20; // The smaller, the more precise the algorithm, but 20 seems to do a good job (for a cell size of 40)
    var startCell = shared.computeCellCoordinates(start.x,start.y);
    var speed = MovementManager.computeSpeed(MovementManager.computeAngle(start,end));
    var distance = MovementManager.euclideanDistance(start,end);
    // Split the path in chunks
    var nbChunks = Math.round(distance/chunkLength);
    var tmp = {
        x: start.x,
        y: start.y
    };
    for(var i = 0; i < nbChunks; i++){
        tmp.x += speed.x*chunkLength;
        tmp.y += speed.y*chunkLength;
        var cell = shared.computeCellCoordinates(tmp.x,tmp.y);
        if(cell.x == startCell.x && cell.y == startCell.y) continue; // ignore obstacles on starting cell
        if(BlocksManager.isBlockAt(cell.x,cell.y)) { // If obstacle, step back and return
            return {
                x: tmp.x - speed.x*chunkLength,
                y: tmp.y - speed.y*chunkLength
            }
        }
    }
    // No obstacle found, return intended end coordinates
    return end;
};


MovementManager.computeAngle = function(a,b){ // return angle between points a and b, in radians
    return -(Math.atan2(b.y- a.y, b.x- a.x)); //*(180/Math.PI));
};

MovementManager.computeSpeed = function(angle){ // return unit speed vector given an angle
    return {
        x: Math.cos(angle),
        y: -Math.sin(angle)
    }
};

MovementManager.euclideanDistance = function(a,b){ // return Euclidean distance between points a and b
    return Math.sqrt(Math.pow(a.x- b.x,2)+Math.pow(a.y- b.y,2));
};

if(onServer) module.exports.MovementManager = MovementManager;