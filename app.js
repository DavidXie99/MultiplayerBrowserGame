var express = require('express');
var app = express();
var serv = require('http').Server(app);
var config = require('cloud-env');
var p2 = require('p2');
var io = require('socket.io')(serv,{});
var GAMEBOUNDX = 1920;
var GAMRBOUNDY = 1080;

app.get('/', function (req, res){
   res.sendFile(__dirname + '/client/index.html');
});
app.use('/client', express.static(__dirname + '/client'));
app.use('/assets', express.static(__dirname + '/assets'));

 
serv.listen(config.PORT, config.IP, function () {
  console.log( "Listening on " + config.IP + ", port " + config.PORT )
});

var world = new p2.World({
    gravity:[0, 0]
});


//Server player class
var Player = function (id) {
    var self = {};
    self.id = id;

    self.pressingRight= false;
    self.pressingLeft= false;
    self.pressingDown= false;
    self.pressingUp= false;

    self.maxspeed = 150;

    self.angle = 0;

    self.body = new p2.Body({
    	mass:1,
    	position:[250,250],
    });

    self.body.addShape(new p2.Box({width:94, height:62}));
    world.addBody(self.body);

    self.updateVel = function () {
        if(self.pressingRight)
            self.body.velocity[0] = self.maxspeed;
        else if(self.pressingLeft)
            self.body.velocity[0] = -self.maxspeed;
        else
            self.body.velocity[0] = 0;

        if(self.pressingUp)
            self.body.velocity[1] = -self.maxspeed;
        else if(self.pressingDown)
            self.body.velocity[1] = self.maxspeed;
        else
            self.body.velocity[1] = 0;
    }

    self.worldbounds = function () {
    	if (self.body.position[0] <= 0) 
    		if (self.body.velocity[0] < 0)
    			self.body.velocity[0] = 0;
    	if (self.body.position[0] >= 1840)
    		if (self.body.velocity[0] > 0)
    			self.body.velocity[0] = 0;
    	if (self.body.position[1] <= 0)
    		if (self.body.velocity[1] < 0) 
    			self.body.velocity[1] = 0;
    	if (self.body.position[1] >= 970)
    		if (self.body.velocity[1] > 0)
    			self.body.velocity[1] = 0;
    }

    self.update = function () {
        self.updateVel();
    }

    Player.list[id] = self;
    return self;
}

Player.list = {};

Player.onConnect = function (socket) {
    console.log("Socket connected with ID: " + socket.id);

    var otherPlayersData = Player.generateCurrentStatusPackage();
    socket.emit('onInitialJoinPopulatePlayers', otherPlayersData);


    var player = Player(socket.id);
    socket.on('updateServerOnMainPlayer', function (data) {
        player.pressingLeft = data.inputs.left;
        player.pressingRight = data.inputs.right;
        player.pressingDown = data.inputs.down;
        player.pressingUp = data.inputs.up;
        player.angle = data.angle;
    });

    //Notify other players
    socket.broadcast.emit('newPlayer', socket.id);

    socket.on('requestServerForBullet', Bullet.handleCreateRequest);
    
}

Player.onDisconnect = function (socket) {
    delete Player.list[socket.id];
}

Player.generateCurrentStatusPackage = function(){
	var pack = {};
	for(var i in Player.list){
		pack[i] = {
			position : Player.list[i].body.position,
			angle : Player.list[i].angle,
		};
	}
	return pack;
}


var Bullet = function(angle, position){
	var self = {};
	self.id = Math.random();
	self.maxspeed = 1200;
	self.body = new p2.Body({
		mass : 1,
		position : position,
		angle: angle,
		velocity: [Math.cos(angle/180*Math.PI) * self.maxspeed, Math.sin(angle/180*Math.PI) * self.maxspeed]
	});
	self.body.addShape(new p2.Box({width:8, height:32}));
	self.timeAlive = 0;
	Bullet.array[self.id] = self;
}

Bullet.array = {};

Bullet.destroyOldBullets = function(){
	for(var id in Bullet.array){
		if(Bullet.array[id].timeAlive > 30){
			delete Bullet.array[id];
		} else{
			Bullet.array[id].timeAlive++;
		}
	}
}

Bullet.handleCreateRequest = function(data){
	Bullet(data.angle, data.position);
	for(var id in SOCKET_LIST){
		SOCKET_LIST[id].emit('bulletCreate', data);
	}
}

//Don't need to touch stuff below here
var SOCKET_LIST = {};
//Handle initial socket connection
io.sockets.on('connection', function (socket) {
	Player.onConnect(socket);
    SOCKET_LIST[socket.id] = socket;
    socket.on('disconnect', function () {
    	socket.broadcast.emit('playerDisconnect', socket.id);
    	Player.onDisconnect(socket);
        delete SOCKET_LIST[socket.id];
    });
});

//Physics loop
var lastTime = Date.now();
setInterval(function () {
	var delta = Date.now()- lastTime;
	lastTime = Date.now();
	for(var i in Player.list){
        var player = Player.list[i];
        player.update();
        player.worldbounds();
    }
	world.step(delta/1000);
	Bullet.destroyOldBullets();
}, 1000/60);

//Update clients loop
setInterval(function () {
    for(var i in SOCKET_LIST){
    	var pack = Player.generateCurrentStatusPackage();
        SOCKET_LIST[i].emit('updateClientOnPlayers', pack);
    }
}, 1000/40);