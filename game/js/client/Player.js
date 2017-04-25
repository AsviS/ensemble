/**
 * Created by Jerome on 19-04-17.
 */

// Class mostly empty at the moment, but will surely fill up over time
function Player(x,y,key){
    // key is a string indicating the atlas to use as texture
    Phaser.Sprite.call(this, game, x,y,key); // Call to constructor of parent
    game.add.existing(this);

    // Here is an example of the kind of events Phaser natively listens to
    /*this.events.onKilled.add(function(player){
        // do something
    },this);*/
}

Player.prototype = Object.create(Phaser.Sprite.prototype);
Player.prototype.constructor = Player;
