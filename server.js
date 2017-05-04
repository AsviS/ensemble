var express = require('express');
var fs = require('fs');
var app = express();
var bodyParser = require("body-parser");
var server = require('http').Server(app);
var mongo = require('mongodb').MongoClient;
var ObjectId = require('mongodb').ObjectID;
var io = require('socket.io').listen(server);
var nodemailer = require('nodemailer');
var gameServer = {};

app.use('/css',express.static(__dirname + '/app/css'));
app.use('/game',express.static(__dirname + '/game/js'));
app.use('/assets',express.static(__dirname + '/game/assets'));
app.use('/app',express.static(__dirname + '/app'));
app.use('/ctrl',express.static(__dirname + '/app/controllers'));
app.use('/views',express.static(__dirname + '/app/views'));
app.use('/images',express.static(__dirname + '/app/images'));
app.use(bodyParser.urlencoded({ extended: false }));
app.use(bodyParser.json());

app.get('/',function(req,res){
    res.sendFile(__dirname+'/app/index.html');
});

server.listen(process.env.PORT || 8081,function(){
    mongo.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/ensemble',function(err,db){
        if(err) throw(err);
        server.db = db;
        console.log('Connection to db established');
        gameServer.initialize();
    });
    console.log('Listening on '+server.address().port);
});

// Handles submission of a new feature
app.post('/api/newfeature', function(req, res) {
    var doc = req.body;
    if(doc.desc === undefined) { // no content in the description
        res.status(400).end();
        return;
    }
    doc.stamp = Date.now();
    doc.upvotes = 0;
    doc.downvotes = 0;
    if(doc.username !== undefined) doc.username = doc.username.substring(0,30); // Limit username length to 30 characters
    if(doc.twitter != undefined) doc.twitter = doc.twitter.substring(0,20); // Limit twitter handle length to 20 characters
    doc.desc = doc.desc.substring(0,500); // Limit description to 500 characters

    server.db.collection('features').insertOne(doc,function(err){
        if(err) {
            res.status(500).end();
            throw err;
        }else {
            res.status(201).end();
        }
    });
});

app.post('/api/newcomment',function(req,res){
    var featureID = req.body.feature;
    var doc = req.body.doc;
    if(doc.comment === undefined || doc.length == 0){
        res.status(400).end();
        return;
    }
    doc.stamp = Date.now();
    if(doc.username !== undefined) doc.username = doc.username.substring(0,30); // Limit username length to 30 characters
    doc.comment = doc.comment.substring(0,200);

    server.db.collection('features').updateOne(
        {_id: new ObjectId(featureID)},
        {'$push':{
            'comments' : doc
        }},
        function(err){
        if(err) {
            res.status(500).end();
            throw err;
        }else {
            res.status(201).end();
        }
    });
});

// Request for the list of submitted features
app.get('/api/features',function(req,res){
    server.db.collection('features').find({}).toArray(function(err,docs){
        if(err) {
            res.status(500).end();
            throw err;
        }else {
            if(docs.length == 0){
                res.status(204).end();
            }else {
                res.status(200).send(docs).end();
            }
        }
    });
});

//  Whenever someone votes, his IP and the ID of the feature for which the vote was cast are combined, and stored
//  together with the timestamp and the vote. No same vote for the same IP/ID pair is allowed within a certain time interval.
//  Obviously this is not the strongest defense against multi-vote, but it's good enough at the moment.
app.voteLog = {};

app.post('/api/vote', function(req, res) {
    var doc = req.body;
    if(doc.vote != 1 && doc.vote != -1){
        res.status(400).end(); // bad request
        return;
    }
    var vote = app.computeAllowedVote(req.ip,doc.id,doc.vote);
    if(vote == 0){
        res.status(403).end();
        return;
    }

    var action = {};
    if(vote >= 1){ // upvote
        action['$inc'] = {upvotes:1,downvotes:-(vote-1)};
    }else if(vote <= -1){ // downvote
        action['$inc'] = {downvotes:1,upvotes:vote+1};
    }else{ // unknwon action
        res.status(400).end(); // bad request
        return;
    }

    server.db.collection('features').updateOne(
        {_id: new ObjectId(doc.id)},
        action,
        function(err){
            if(err) {
                res.status(500).end();
                throw err;
            }else {
                res.status(200).end();
            }
        }
    );
});

// Returns the allowed vote (0 for not allowed, +1 or -1 for new up/downvote, +2 or -2 to change an up/downvote to the contrary
app.computeAllowedVote = function(ip,id,vote){ // vote is +1 or -1
    var delay = 1000*60*60*2; // 2 hours
    var hash = id+'-'+ip; // simple "hash" that concatenates the feature id with the ip address
    if(app.voteLog.hasOwnProperty(hash)){
        var voteData = app.voteLog[hash];
        if(voteData.vote == vote && (Date.now() - voteData.stamp) < delay) return 0; // can't cast the same vote twice within delay
        var allowedVote = 0;
        if(voteData.vote == -1 && vote == 1) allowedVote = 2; // cancel previous -1 and add 1
        if(voteData.vote == 1 && vote == -1) allowedVote = -2; // cancel previous 1 and add -1
        voteData.stamp = Date.now();
        voteData.vote = vote;
        return allowedVote;
    }else{
        voteData = {
            stamp: Date.now(),
            vote: vote
        };
        app.voteLog[hash] = voteData;
        return vote;
    }
};

var multipartyMiddleware = require('connect-multiparty')(); // Needed to access req.body.files

app.mailTransporter = nodemailer.createTransport({ // transporter used to send the artworks by e-mail
    service: 'gmail',
    auth: {
        user: process.env.dynetisMailAddress,
        pass: process.env.dynetisMailPassword
    },
    tls: { rejectUnauthorized: false }
});

// Handles artwork submissions
app.post('/api/newart', multipartyMiddleware,function(req,res){
    var filePath = req.files.file.path;
    if (!fs.existsSync(filePath)) {
        res.status(404).end();
        return;
    }
    var text = (req.body.comment || 'No comment');
    if(req.body.username) text += "\n\n By "+req.body.username;
    if(req.body.email) text += " ("+req.body.email+")";
    mailOptions = {
        from: req.body.email || process.env.dynetisMailAddress,
        to: process.env.adminAddress,
        subject: 'New art submission for the Ensemble project',
        text: text,
        attachments: [{
            filename: req.files.file.name,
            path: filePath
        }]
    };
    app.mailTransporter.sendMail(mailOptions, function(err) {
        if (err) {
            console.log(err);
            res.status(500).end();
        }
        res.status(200).end()
    });
});

module.exports.io = io;
module.exports.server = server;

var gameServer = require('./game/js/server/gameserver.js').gameServer;
