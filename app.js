// cop fqdn.  Don't include http, https, etc.
const url = 'www.ironrain.org'

// enable content security policy (this requires url to be set!)
const cspEnabled = false;

const Ajv = require('ajv');
const validators = require('./validators.js');
const express = require('express');
const app = express();
const async = require('async');
const bcrypt = require('bcrypt');
const bodyParser = require('body-parser');
const cookieParser = require('cookie-parser');
const crypto = require('crypto');
const fs = require('fs');
const http = require('http').Server(app);
const session = require('express-session');
const MongoClient = require('mongodb').MongoClient;
const MongoStore = require('connect-mongo')(session);
const multer = require('multer');
const ObjectID = require('mongodb').ObjectID;
const path = require('path');
const ShareDB = require('sharedb');
const richText = require('rich-text');
const rooms = new Map();
const upload = multer({dest: './temp_uploads'});
const WebSocketJSONStream = require('websocket-json-stream');
const xssFilters = require('xss-filters');
const wss = require('ws');
const ws = new wss.Server({server:http});

app.set('view engine', 'pug');
app.use(express.static('public'));
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(session({
    secret: 'ProtextTheCybxers',
    name: 'session',
    saveUninitialized: true,
    resave: true,
    store: new MongoStore({
        url: 'mongodb://localhost/ctfcop',
        host: 'localhost',
        collection: 'sessions',
        autoReconnect: true,
        clear_interval: 3600
    })
}));

if (cspEnabled) {
    app.use(function(req, res, next) {
        res.setHeader("Content-Security-Policy", "connect-src 'self' wss://" + url + " ws://" + url + "; worker-src 'self' https://" + url + " blob:; default-src 'unsafe-inline' 'unsafe-eval' 'self'; img-src 'self' data: blob:;");
        return next();
    });
}

// setup ajv json validation
const ajv = new Ajv();

// connect to mongo
var mdb;
MongoClient.connect('mongodb://localhost/ctfcop', {
        useNewUrlParser: true,
        useUnifiedTopology: true,
        reconnectTries: Number.MAX_VALUE,
        autoReconnect: true,
        wtimeout: 5000 
    }, (err, database) => {
        if (err) throw err;
        database.on('close', function() {
            console.log('Connection to database closed. Error?');
            ws.clients.forEach(function each(socket) {
                socket.close();
            });
        });
        mdb = database.db('ctfcop');
    }
);

const sdb = require('sharedb-mongo')('mongodb://localhost:27017/ctfcop');
ShareDB.types.register(richText.type);
const backend = new ShareDB({db: sdb, disableDocAction: true, disableSpaceDelimitedActions: true});

backend.use('receive', function(r,c) {
    c();
});

Array.prototype.move = function (old_index, new_index) {
    if (new_index >= this.length) {
        var k = new_index - this.length;
        while ((k--) + 1) {
            this.push(undefined);
        }
    }
    this.splice(new_index, 0, this.splice(old_index, 1)[0]);
    return this;
};

function dynamicSort(property) {
    var sortOrder = 1;
    if(property[0] === "-") {
        sortOrder = -1;
        property = property.substr(1);
    }
    return function (a,b) {
        var result = (a[property] < b[property]) ? -1 : (a[property] > b[property]) ? 1 : 0;
        return result * sortOrder;
    }
}

function sendToRoom(room, msg, selfSocket, permRequired) {
    if (!selfSocket) {
        selfSocket = null;
    }
    if (!permRequired) {
        permRequired = null;
    }
    if (rooms.get(room)) {
        rooms.get(room).forEach((socket) => {
            if (socket && socket.readyState === socket.OPEN) {
                if (socket !== selfSocket && (!permRequired || socket.cop_permissions[permRequired])) {
                    socket.send(msg); 
                }
            }
        });
    }
}

function getDir(dir, mission_id, cb) {
    var resp = new Array();
    if (dir === path.join(__dirname + '/mission_files/mission-' + mission_id)) {
        fs.stat(dir, function (err, s) {
            if (err == null) {
            } else if (err.code == 'ENOENT') {
                fs.mkdir(dir,function(err){
                    if(err)
                        console.log(err);
               });
            } else {
                console.log(err);
            }
        });
        resp.push({
            "id": '/',
            "text": '/',
            "icon" : 'jstree-custom-folder',
            "state": {
                "opened": true,
                "disabled": false,
                "selected": false
            },
            "li_attr": {
                "base": '#',
                "isLeaf": false
            },
            "a_attr": {
                "class": 'droppable'
            },
            "children": null
        });
    }
    fs.readdir(dir, function(err, list) {
        if (list) {
            var children = new Array();
            list.sort(function(a, b) {
                return a.toLowerCase() < b.toLowerCase() ? -1 : 1;
            }).forEach(function(file, key) {
                children.push(processNode(dir, mission_id, file));
            });
            if (dir === path.join(__dirname + '/mission_files/mission-' + mission_id)) {
                resp[0].children = children;
                cb(resp);
            } else
                cb(children);
        } else {
            cb([]);
        }
    });
}

function processNode(dir, mission_id, f) {
    var s = fs.statSync(path.join(dir, f));
    var base = path.join(dir, f);
    var rel = path.relative(path.join(__dirname, '/mission_files/mission-' + mission_id), base);
    return {
        "id": rel,
        "text": f,
        "icon" : s.isDirectory() ? 'jstree-custom-folder' : 'jstree-custom-file',
        "state": {
            "opened": false,
            "disabled": false,
            "selected": false
        },
        "li_attr": {
            "base": rel,
            "isLeaf": !s.isDirectory()
        },
        "a_attr": {
            "class": (s.isDirectory() ? 'droppable' : '')
        },
        "children": s.isDirectory()
    };
}

async function insertLogEvent(socket, message, channel) {
    if (!channel || channel === '')
        channel = 'log';
    var timestamp = (new Date).getTime();
    var log = { mission_id: ObjectID(socket.mission_id), user_id: ObjectID(socket.user_id), channel: channel, text: message, timestamp: timestamp, deleted: false };
    try {
        var res = await mdb.collection('chats').insertOne(log);
        log.username = socket.username;
        sendToRoom(socket.room, JSON.stringify({ act: 'chat', arg: [ log ] }));
        return [];
    } catch (err) {
        console.log(err);
        return [];
    }
}

ws.on('connection', function(socket, req) {
    socket.loggedin = false;
    socket.session = '';
    socket.mission_id = 0;
    var s = req.headers.cookie.split('session=s%3A')[1].split('.')[0];
    if (s) {
        socket.session = s;
        mdb.collection('sessions').findOne({ _id: s }, function(err, row) {
            if (row) {
                try {
                    var data = JSON.parse(row.session);
                    socket.loggedin = data.loggedin;
                    socket.user_id = data.user_id;
                    socket.username = data.username;
                    socket.cop_permissions = data.cop_permissions;
                    socket.mission_permissions = data.mission_permissions;
                    setupSocket(socket);
                } catch (e) {
                    console.log(e);
                }
            } else if (err)
                console.log(err);
        });
    }
    socket.isAlive = true;
});

// make sure sockets are still alive
const pingInterval = setInterval(function ping() {
    ws.clients.forEach(function each(socket) {
        if (socket.isAlive === false)
            return socket.terminate();
        socket.isAlive = false;
        socket.ping(function() {});
    });
}, 30000);

// get object listing
async function getObjects(socket) {
    try {
        res = await mdb.collection('objects').find({ mission_id: ObjectID(socket.mission_id), deleted: { $ne: true } }).sort({ z: 1 }).toArray();
        return res;
    } catch (err) {
        console.log(err);
        return [];
    }
}

// get user listing
async function getUsers(socket, limited) {
    var projection = { password: 0, deleted: 0 };
    if (limited) {
        projection.api = 0;
        projection.avatar = 0;
        projection.name = 0;
        projection.permissions = 0;
    }
    try {
        var users = await mdb.collection('users').find({ deleted: { $ne: true } }, { projection: projection }).toArray();
        socket.send(JSON.stringify({ act:'get_users', arg: users }));
    } catch (err) {
        socket.send(JSON.stringify({ act: 'error', arg: { text: 'Error getting users.' }}));
        socket.send(JSON.stringify({ act:'get_users', arg: [] }));
        console.log(err);
    }
}

// insert new user
async function insertUser(socket, user) {
    hash = await bcrypt.hash(user.password, 10);
    var new_values = {};
    new_values.username = xssFilters.inHTMLData(user.username);
    new_values.name = xssFilters.inHTMLData(user.name);
    new_values.password = hash;
    new_values.api = crypto.randomBytes(32).toString('hex');
    new_values.avatar = '';
    new_values.deleted = false;
    new_values.permissions = user.permissions;
    try {
        var res = await mdb.collection('users').insertOne(new_values);
        res.ops[0].password = '';
        sendToRoom(socket.room, JSON.stringify({ act: 'insert_user', arg: res.ops[0] }));
    } catch (err) {
        socket.send(JSON.stringify({ act: 'error', arg: { text: 'Error inserting user.' }}));
        console.log(err);
    }
}

// update user
async function updateUser(socket, user) {
    if (user.name === 'admin') {
        user.permissions = { manage_users: true, manage_missions: true }; // make sure admin always has all permissions
    }
    var new_values = {};
    if (user.password && user.password !== '') {
        new_values.password = await bcrypt.hash(user.password, 10);
    }
    new_values.name = user.name;
    new_values.permissions = user.permissions;
    try {
        var res = await mdb.collection('users').updateOne({ _id: ObjectID(user._id) }, { $set: new_values });
        if (res.result.ok === 1) {
            delete user.username;
            delete user.api;
            user.password = '';
            sendToRoom(socket.room, JSON.stringify({ act: 'update_user', arg: user }));
        }
        else {
            socket.send(JSON.stringify({ act: 'error', arg: { text: 'Error updating user.' }}));
        }
    } catch (err) {
        socket.send(JSON.stringify({ act: 'error', arg: { text: 'Error updating user.' }}));
        console.log(err);
    }
}

// delete user
async function deleteUser(socket, user) {
    try {
        var res = await mdb.collection('users').updateOne({ _id: ObjectID(user) }, { $set: { deleted: true } });
        if (res.result.ok === 1) {
            sendToRoom(socket.room, JSON.stringify({ act: 'delete_user', arg: user }));
        }
        else {
            socket.send(JSON.stringify({ act: 'error', arg: { text: 'Error deleting user.' }}));
        }
    } catch (err) {
        socket.send(JSON.stringify({ act: 'error', arg: { text: 'Error deleting user.' }}));
        console.log(err);
    }
}

// get all missions (based on perms)
async function getMissions(socket) {
    try {
        var missions = await mdb.collection('missions').aggregate([
            {
                $match: { deleted: { $ne: true }}
            },{
                $lookup: {
                    from: 'users',
                    localField: 'user_id',
                    foreignField: '_id',
                    as: 'username'
                },
            },{
                $project: {
                    _id: 1,
                    name: 1,
                    start_date: 1,
                    username: '$username.username'
                }
            }
        ]).toArray();
        socket.send(JSON.stringify({ act:'get_missions', arg: missions }));
    } catch (err) {
        socket.send(JSON.stringify({ act: 'error', arg: { text: 'Error getting missions.' }}));
        socket.send(JSON.stringify({ act:'get_missions', arg: [] }));
        console.log(err);
    }
}

// insert mission
async function insertMission(socket, mission) {
    mission.name = xssFilters.inHTMLData(mission.name);
    var mission = { name: mission.name, user_id: ObjectID(socket.user_id), mission_users: [], deleted: false };
    mission.mission_users[0] = { _id: ObjectID(null), user_id: ObjectID(socket.user_id), permissions: { manage_users: true, modify_diagram: true, modify_notes: true, modify_files: true, api_access: true } };
    try {
        var res = await mdb.collection('missions').insertOne(mission);
        sendToRoom(socket.room, JSON.stringify({ act: 'insert_mission', arg: res.ops[0] }));
    } catch (err) {
        socket.send(JSON.stringify({ act: 'error', arg: { text: 'Error inserting mission.' }}));
        console.log(err);
    }
}

// update mission
async function updateMission(socket, mission) {
    mission.name = xssFilters.inHTMLData(mission.name);
    var new_values = { $set: { name: mission.name }};
    try {
        var res = await mdb.collection('missions').updateOne({ _id: ObjectID(mission._id) }, new_values);
        if (res.result.ok === 1) {
            sendToRoom(socket.room, JSON.stringify({ act: 'update_mission', arg: mission }));
        }
        else {
            socket.send(JSON.stringify({ act: 'error', arg: { text: 'Error updating mission.' }}));
        }
    } catch (err) {
        console.log(err);
        socket.send(JSON.stringify({ act: 'error', arg: { text: 'Error updating mission.' }}));
    }
}

// delete mission
async function deleteMission(socket, mission) {
    try {
        var res = await mdb.collection('missions').updateOne({ _id: ObjectID(mission) }, { $set: { deleted: true } });
        if (res.result.ok === 1) {
            sendToRoom(socket.room, JSON.stringify({ act: 'delete_mission', arg: mission }));
        }
        else {
            socket.send(JSON.stringify({ act: 'error', arg: { text: 'Error deleting mission.' }}));
        }
    } catch (err) {
        console.log(err);
        socket.send(JSON.stringify({ act: 'error', arg: { text: 'Error deleting mission.' }}));
    }
}

// insert chat
async function insertChat(socket, chat) {
    chat.username = socket.username;
    chat.user_id = socket.user_id;
    chat.text = xssFilters.inHTMLData(chat.text);
    chat.timestamp = (new Date).getTime();
    var chat_row = { mission_id: ObjectID(socket.mission_id),
        user_id: ObjectID(socket.user_id),
        channel: chat.channel,
        text: chat.text,
        timestamp: chat.timestamp,
        deleted: false };
    try {
        var res = await mdb.collection('chats').insertOne(chat_row);
        sendToRoom(socket.room, JSON.stringify({ act:'chat', arg: [chat] }));
    } catch (err) {
        socket.send(JSON.stringify({ act: 'error', arg: { text: 'Error inserting chat.' }}));
        console.log(err);
    }
}

// get old chats
async function getOldChats(socket, request) {
    try {
        var rows = await mdb.collection('chats').aggregate([
            {
                $match: { mission_id: ObjectID(socket.mission_id), channel: request.channel, timestamp: { $lt: parseInt(request.start_from) }, deleted: { $ne: true } }
            },{
                $sort: { timestamp: -1 }
            },{
                $limit: 50
            },{
                $lookup: {
                    from: 'users',
                    localField: 'user_id',
                    foreignField: '_id',
                    as: 'username'
                }
            },{
                $project: {
                    _id: 1,
                    user_id: 1,
                    channel: 1,
                    text: 1,
                    timestamp: 1,
                    prepend: 'true',
                    username: '$username.username'
                }
        }]).toArray();

        if (rows) {
            if (rows.length == 50)
                if (request.start_from !== undefined && !isNaN(request.start_from))
                    rows[49].more = 1;
                else
                    rows[0].more = 1;
            socket.send(JSON.stringify({ act:'bulk_chat', arg: rows }));
        } else {
            socket.send(JSON.stringify({ act: 'bulk_chat', arg: [] }));
        }
    } catch (err) {
        socket.send(JSON.stringify({ act: 'error', arg: { text: 'Error getting old chats.' }}));
        console.log(err);
    }
}

// add user to a mission
async function insertUserMission(socket, user) {
    try {
        var count = await mdb.collection('missions').count({ _id: ObjectID(socket.mission_id), 'mission_users.user_id': ObjectID(user.user_id) });

        // don't let the user make the same user setting over again
        if (count === 0) {
            var new_values = { _id: ObjectID(null), user_id: ObjectID(user.user_id), permissions: user.permissions };
            var res = await mdb.collection('missions').updateOne({ _id: ObjectID(socket.mission_id) }, { $push: { mission_users: new_values }});
            if (res.result.ok === 1) {
                var user = await mdb.collection('users').findOne({ _id: ObjectID(user.user_id), deleted: { $ne: true }});
                new_values.username = user.username;
                sendToRoom(socket.room, JSON.stringify({ act: 'insert_user_mission', arg: new_values }));
            }
            else {
                socket.send(JSON.stringify({ act: 'error', arg: { text: 'Error inserting user in mission.' }}));
            }
        } else {
            socket.send(JSON.stringify({ act: 'error', arg: { text: 'Error inserting user in mission.' }}));
        }
    } catch (err) {
        socket.send(JSON.stringify({ act: 'error', arg: { text: 'Error inserting user in mission.' }}));
        console.log(err);
    }
}

// update user in mission
async function updateUserMission(socket, user) {
    try {
        var rows = await mdb.collection('missions').aggregate([
                {
                    $match: { _id: ObjectID(socket.mission_id), deleted: { $ne: true } }
                },{
                    $unwind: '$mission_users'
                },{
                    $match: { 'mission_users._id': { $ne: ObjectID(user._id) }, 'mission_users.user_id': ObjectID(user.user_id) }
                }
            ]).toArray();

        if (rows.length == 0) { 
            var new_values = { 'mission_users.$.user_id': ObjectID(user.user_id), 'mission_users.$.permissions': user.permissions };
            var res = await mdb.collection('missions').updateOne({ _id: ObjectID(socket.mission_id), 'mission_users._id': ObjectID(user._id) }, { $set: new_values });
            if (res.result.ok === 1) {
                var ouser = await mdb.collection('users').findOne({ _id: ObjectID(user.user_id), deleted: { $ne: true }});
                user.username = ouser.username;
                sendToRoom(socket.room, JSON.stringify({act: 'update_user_mission', arg: user}));
                insertLogEvent(socket, 'Modified user setting ID: ' + user._id + '.');
            }
            else {
                socket.send(JSON.stringify({ act: 'error', arg: { text: 'Error updating mission user.' }}));
            }
        } else {
            socket.send(JSON.stringify({ act: 'error', arg: { text: 'Error updating mission user.' }}));
        }
    } catch (err) {
        socket.send(JSON.stringify({ act: 'error', arg: { text: 'Error updating mission user.' }}));
        console.log(err);
    }
}

// delete user from mission
async function deleteUserMission(socket, _id) {
    try {
        var res = await mdb.collection('missions').findOneAndUpdate({ _id: ObjectID(socket.mission_id) }, { $pull: { mission_users: { _id: ObjectID(_id) }}});
        if (res.ok === 1) {
            sendToRoom(socket.room, JSON.stringify({ act: 'delete_user_mission', arg: _id }));
        }
        else {
            socket.send(JSON.stringify({ act: 'error', arg: { text: 'Error deleting user from mission.' }}));
        }
    } catch (err) {
        socket.send(JSON.stringify({ act: 'error', arg: { text: 'Error deleting user from mission.' }}));
        console.log(err);
    }
}

// get notes list
async function getNotes(socket) {
    try {
        var resp = new Array();
        var rows = await mdb.collection('notes').find({ $and: [ { mission_id: ObjectID(socket.mission_id) }, { deleted: { $ne: true } } ] }).sort({ name : 1 }).toArray();
        for (var i = 0; i < rows.length; i++) {
            resp.push({
                "id": rows[i]._id,
                "text": rows[i].name,
                "icon" : 'jstree-custom-file',
                "state": {
                    "opened": false,
                    "disabled": false,
                    "selected": false
                },
                "li_attr": {
                    "base": '#',
                    "isLeaf": true
                },
                "children": false
            });
        }
        return resp;
    } catch (err) {
        console.log(err);
        return [];
    }
}

async function insertNote(socket, note) {
    note.name = xssFilters.inHTMLData(note.name);
    var note_row = { mission_id: ObjectID(socket.mission_id), name: note.name, deleted: false };
    try {
        var res = await mdb.collection('notes').insertOne(note_row);
        insertLogEvent(socket, 'Created note: ' + note.name + '.');
        sendToRoom(socket.room, JSON.stringify({act: 'insert_note', arg: {
            "id": note_row._id,
            "text": note.name,
            "icon" : 'jstree-custom-file',
            "state": {
                "opened": false,
                "disabled": false,
                "selected": false
            },
            "li_attr": {
                "base": '#',
                "isLeaf": true
            },
            "children": false
        }}));
    } catch (err) {
        socket.send(JSON.stringify({ act: 'error', arg: { text: 'Error inserting note.' }}));
        console.log(err);
    }
}

async function renameNote(socket, note) {
    note.name = xssFilters.inHTMLData(note.name);
    var new_values = { $set: { name: note.name } };
    try {
        var res = await mdb.collection('notes').updateOne({ _id: ObjectID(note.id) }, new_values);
        insertLogEvent(socket, 'Renamed note: ' + note.id + ' to: ' + note.name + '.');
        sendToRoom(socket.room, JSON.stringify({act: 'rename_note', arg: {
            id: note.id,
            name: note.name
        }}));
    } catch (err) {
        socket.send(JSON.stringify({ act: 'error', arg: { text: 'Error renaming note.' }}));
        console.log(err);
    }
}

async function deleteNote(socket, note) {
    try {
        var res = mdb.collection('notes').updateOne({ _id: ObjectID(note.id) }, { $set: { deleted: true } });
        insertLogEvent(socket, 'Deleted note: ' + note.id + '.');
        sendToRoom(socket.room, JSON.stringify({act: 'delete_note', arg: note.id}));
    } catch (err) {
        socket.send(JSON.stringify({ act: 'error', arg: { text: 'Error deleting note.' }}));
        console.log(err);
    }
}

async function getMissionUsers(socket) {
    try {
        return await mdb.collection('missions').aggregate([
            {
                $match: { _id: ObjectID(socket.mission_id), deleted: { $ne: true } }
            },{
                $unwind: '$mission_users'
            },{
                $lookup: {
                    from: 'users',
                    localField: 'mission_users.user_id',
                    foreignField: '_id',
                    as: 'user'
                }
            },{
                $project: {
                    _id: '$mission_users._id',
                    user_id: '$mission_users.user_id',
                    username: {
                        $arrayElemAt: [ '$user.username', 0 ]
                    },
                    permissions: '$mission_users.permissions',
                }
            }
        ]).toArray();
    } catch (err) {
        console.log(err);
        return [];
    }
}

async function getChats(socket) {
    try {
        var res = [];
        var channels = await mdb.collection('chats').distinct('channel');
        for (var i = 0; i < channels.length; i++) {
            var rows = await mdb.collection('chats').aggregate([
                {
                    $match: { mission_id: ObjectID(socket.mission_id), channel: channels[i], deleted: { $ne: true } }
                },{
                    $sort: { timestamp: -1 }
                },{
                    $limit: 50
                },{
                    $sort: { timestamp: 1 }
                },{
                    $lookup: {
                        from: 'users',
                        localField: 'user_id',
                        foreignField: '_id',
                        as: 'username'
                    }
                },{
                    $project: {
                        _id: 1,
                        user_id: 1,
                        channel: 1,
                        text: 1,
                        timestamp: 1,
                        username: '$username.username'
                    }
                }]).toArray();
            if (rows) {
                if (rows.length == 50) {
                    rows[0].more = 1;
                }
                res = res.concat(rows);
            }
        }
        return res;
    } catch (err) {
        console.log(err);
        return [];
    }
}

async function setupSocket(socket) {
    if (!socket.loggedin) {
        socket.close();
        return;
    }

    socket.on('pong', function () {
        socket.isAlive = true;
    });

    socket.on('message', async function(msg, flags) {
        try {
            msg = JSON.parse(msg);
        } catch (e) {
            return;
        }

        if (msg.act && socket.loggedin) {
            switch (msg.act) {
                case 'stream':
                    var stream = new WebSocketJSONStream(socket);
                    socket.type = 'sharedb';
                    backend.listen(stream);
                    break;

                // join mission room
                case 'join':
                    //TODO permissions
                    socket.room = msg.arg.mission_id;
                    socket.mission_id = msg.arg.mission_id;
                    if (!rooms.get(msg.arg.mission_id)) {
                        rooms.set(msg.arg.mission_id, new Set());
                    }

                    rooms.get(msg.arg.mission_id).add(socket);
                    socket.type = 'diagram';

                    var resp = {};
                    var limited = true;
                    if (socket.mission_permissions[msg.arg.mission_id].manage_users) {
                        resp.users = await getUsers(socket, true);
                        resp.userSettings = await getMissionUsers(socket);
                    }                    
                    resp.objects = await getObjects(socket);
                    resp.notes = await getNotes(socket);
                    resp.chats = await getChats(socket);

                    socket.send(JSON.stringify({ act:'join', arg: resp }));
                    break;
                
                case 'main':
                // join main room
                    socket.room = 'main';
                    if (!rooms.get('main')) {
                        rooms.set('main', new Set());
                    }
                    rooms.get('main').add(socket);
                    socket.type = 'main';
                    break;

                case 'config':
                // join config room
                    socket.room = 'config';
                    if (!rooms.get('config')) {
                        rooms.set('config', new Set());
                    }
                    rooms.get('config').add(socket);
                    socket.type = 'config';
                    break;

                case 'get_missions':
                    getMissions(socket);
                    break;

                case 'insert_mission':
                    if (socket.cop_permissions.manage_missions && ajv.validate(validators.insert_mission, msg.arg)) {
                        insertMission(socket, msg.arg);
                    } else {
                        socket.send(JSON.stringify({ act: 'error', arg: { text: 'Permission denied or invalid data.' }}));
                        console.log('[!] inert_mission failed.');
                    }
                    break;

                case 'update_mission':
                    if (socket.cop_permissions.manage_missions && ajv.validate(validators.update_mission, msg.arg)) {
                        updateMission(socket, msg.arg);
                    } else {
                        socket.send(JSON.stringify({ act: 'error', arg: { text: 'Permission denied or invalid data.' }}));
                        console.log('[!] update_mission failed.')
                    }
                    break;

                case 'delete_mission':
                    if (socket.cop_permissions.manage_missions && ajv.validate(validators.delete_mission, msg.arg)) {
                        deleteMission(socket, msg.arg.mission_id);
                    } else {
                        socket.send(JSON.stringify({ act: 'error', arg: { text: 'Permission denied or invalid data.' }}));
                        console.log('[!] delete_mission failed.')
                    }
                    break;

                // get users
                case 'get_users':
                    if (socket.cop_permissions.manage_users) {
                        getUsers(socket);
                    }
                    else {
                        socket.send(JSON.stringify({ act: 'error', arg: { text: 'Permission denied or invalid data.' }}));
                        console.log('[!] get_users failed.')
                    }
                    break;

                case 'insert_user':
                    if (socket.cop_permissions.manage_users && ajv.validate(validators.insert_user, msg.arg)) {
                        insertUser(socket, msg.arg);
                    } else {
                        socket.send(JSON.stringify({ act: 'error', arg: { text: 'Permission denied or invalid data.' }}));
                        console.log('[!] insert_user failed.')
                    }
                    break;

                case 'update_user':
                    if (socket.cop_permissions.manage_users && ajv.validate(validators.update_user, msg.arg)) {
                        updateUser(socket, msg.arg);
                    } else {
                        socket.send(JSON.stringify({ act: 'error', arg: { text: 'Permission denied or invalid data.' }}));
                        console.log('[!] update_user failed.')
                    }
                    break;

                case 'delete_user':
                    if (socket.cop_permissions.manage_users && ajv.validate(validators.delete_user, msg.arg)) {
                        deleteUser(socket, msg.arg.user_id);
                    } else {
                        socket.send(JSON.stringify({ act: 'error', arg: { text: 'Permission denied or invalid data.' }}));
                        console.log('[!] delete_user failed.')
                    }
                    break;

                default:
                    // mission commands
                    if (socket.mission_id && ObjectID.isValid(socket.mission_id) && socket.user_id && ObjectID.isValid(socket.user_id)) {
                        switch (msg.act) {
                        // ------------------------- CHATS -------------------------
                        case 'insert_chat':
                            if (ajv.validate(validators.insert_chat, msg.arg)) {
                                insertChat(socket, msg.arg);
                            } else {
                                socket.send(JSON.stringify({ act: 'error', arg: { text: 'Permission denied or invalid data.' }}));
                                console.log('[!] insert_chat failed.')
                            }
                            break;

                        case 'get_old_chats':
                            if (ajv.validate(validators.get_old_chats, msg.arg)) {
                                getOldChats(socket, msg.arg);
                            } else {
                                socket.send(JSON.stringify({ act: 'error', arg: { text: 'Permission denied or invalid data.' }}));
                                console.log('[!] get_old_chats failed.')
                            }
                            break;

                    case 'insert_user_mission':
                        if (socket.mission_permissions[socket.mission_id].manage_users && ajv.validate(validators.insert_user_mission, msg.arg)) {
                            insertUserMission(socket, msg.arg);
                        } else {
                            socket.send(JSON.stringify({ act: 'error', arg: { text: 'Permission denied or invalid data.' }}));
                            console.log('[!] insert_user_mission failed.')
                        }
                        break;

                    case 'update_user_mission':
                        if (socket.mission_permissions[socket.mission_id].manage_users && ajv.validate(validators.update_user_mission, msg.arg)) {
                            updateUserMission(socket, msg.arg);
                        } else {
                            socket.send(JSON.stringify({ act: 'error', arg: { text: 'Permission denied or invalid data.' }}));
                            console.log('[!] update_user_mission failed.')
                        }
                        break;

                    case 'delete_user_mission':
                        if (socket.mission_permissions[socket.mission_id].manage_users && ajv.validate(validators.delete_user_mission, msg.arg)) {
                            deleteUserMission(socket, msg.arg._id);
                        }
                        else {
                            socket.send(JSON.stringify({ act: 'error', arg: { text: 'Permission denied or invalid data.' }}));
                            console.log('[!] delete_user_mission failed.')
                        }
                        break;

                    // ------------------------- NOTES -------------------------
                    case 'insert_note':
                        if (socket.mission_permissions[socket.mission_id].modify_notes && ajv.validate(validators.insert_note, msg.arg)) {
                            insertNote(socket, msg.arg);
                        } else
                            socket.send(JSON.stringify({ act: 'error', arg: { text: 'Error: Permission denied or invalid data.' } }));
                        break;

                    case 'rename_note':
                        if (socket.mission_permissions[socket.mission_id].modify_notes && ajv.validate(validators.rename_note, msg.arg)) {
                            renameNote(socket, msg.arg);
                        } else
                            socket.send(JSON.stringify({ act: 'error', arg: { text: 'Error: Permission denied or invalid data.' } }));
                        break;

                    case 'delete_note':
                        if (socket.mission_permissions[socket.mission_id].modify_notes && ajv.validate(validators.delete_note, msg.arg)) {
                            deleteNote(socket, msg.arg);
                        } else
                            socket.send(JSON.stringify({ act: 'error', arg: { text: 'Error: Permission denied or invalid data.' } }));
                        break;

                    // ------------------------- OBJECTS -------------------------
                    case 'paste_object':
                        if (socket.mission_permissions[socket.mission_id].modify_diagram) {
                            var args = [];
                            async.eachOf(msg.arg, function(o, index, callback) {
                                if (ajv.validate(validators.paste_object, o)) {
                                    mdb.collection('objects').findOne({ _id: ObjectID(o._id), type: { $ne: 'link' }, deleted: { $ne: true }}, function(err, row) {
                                        if (row) {
                                            row._id = ObjectID(null);
                                            row.z = o.z;
                                            row.x = o.x;
                                            row.y = o.y;

                                            mdb.collection('objects').insertOne(row, function (err, result) {
                                                if (!err) {
                                                    insertLogEvent(socket, 'Created ' + row.type + ': ' + row.name + '.');
                                                    args.push(row);
                                                    callback();
                                                } else
                                                    callback(err);
                                            });
                                        } else {
                                            if (err)
                                                callback(err);
                                        }
                                    });
                                }
                            }, function (err) {
                                if (err)
                                    console.log(err);
                                else
                                    sendToRoom(socket.room, JSON.stringify({ act: 'insert_object', arg: args }));
                            });
                        } else
                            socket.send(JSON.stringify({ act: 'error', arg: { text: 'Error: Permission denied. Changes not saved.' } }));
                        break;

                    case 'insert_object':
                        var o = msg.arg;
                        if (socket.mission_permissions[socket.mission_id].modify_diagram && ajv.validate(validators.insert_object, o)) {
                            o.rot = 0;
                            o.scale_x = 1;
                            o.scale_y = 1;
                            if (o.type === 'shape') {
                                o.scale_x = 65;
                                o.scale_y = 65;
                            }
                            o.type = xssFilters.inHTMLData(o.type);
                            o.name = xssFilters.inHTMLData(o.name);
                            o.fill_color = xssFilters.inHTMLData(o.fill_color);
                            o.stroke_color = xssFilters.inHTMLData(o.stroke_color);
                            o.image = xssFilters.inHTMLData(o.image);

                            // get object count for new z
                            mdb.collection('objects').count({ mission_id: ObjectID(socket.mission_id) }, function(err, count) {
                                if (!err) {
                                    var new_object;
                                    if (o.type === 'icon' || o.type === 'shape')
                                        new_object = { mission_id: ObjectID(socket.mission_id), type: o.type, name: o.name, fill_color: o.fill_color, stroke_color: o.stroke_color, image: o.image, scale_x: o.scale_x, scale_y: o.scale_y, rot: o.rot, x: o.x, y: o.y, z: count, locked: o.locked, deleted: false };
                                    else if (o.type === 'link')
                                        new_object = { mission_id: ObjectID(socket.mission_id), type: o.type, name: o.name, stroke_color: o.stroke_color, image: o.image, obj_a: ObjectID(o.obj_a), obj_b: ObjectID(o.obj_b), z: 0, locked:o.locked, deleted: false };
                                    // add object to db
                                    mdb.collection('objects').insertOne(new_object, function (err, result) {
                                        if (!err) {
                                            // if link, push to back
                                            if (o.type === 'link') {
                                                mdb.collection('objects').find({ $and: [ { mission_id: ObjectID(socket.mission_id) }, { deleted: { $ne: true } } ] }, { _id: 1 }).sort({ z: 1 }).toArray(function(err, rows) {
                                                    var zs = rows.map(r => String(r._id));
                                                    zs.move(zs.indexOf(String(new_object._id)), 0);
                                                    async.forEachOf(zs, function(item, index, callback) {
                                                        var new_values = { $set: { z: index }};
                                                        mdb.collection('objects').updateOne({ _id: ObjectID(item) }, new_values, function (err, result) {
                                                            if (err)
                                                                callback(err);
                                                            else
                                                                callback();
                                                        });
                                                    }, function(err) {
                                                        insertLogEvent(socket, 'Created ' + o.type + ': ' + o.name + '.');
                                                        sendToRoom(socket.room, JSON.stringify({ act: 'insert_object', arg: [new_object] }));
                                                    });
                                                });
                                            } else {
                                                // push object back to room
                                                insertLogEvent(socket, 'Created ' + o.type + ': ' + o.name + '.');
                                                sendToRoom(socket.room, JSON.stringify({ act: 'insert_object', arg: [new_object] }));
                                            }
                                        } else {
                                            console.log(err);
                                        }
                                    });
                                } else {
                                    console.log(err);
                                }
                            });
                        } else {
                            socket.send(JSON.stringify({ act: 'error', arg: { text: 'Error: Permission denied. Changes not saved.' } }));
                        }
                        break;

                    case 'delete_object':
                        var o = msg.arg;
                        if (socket.mission_permissions[socket.mission_id].modify_diagram || !o._id || !ObjectID.isValid(o._id)) {
                            var query = { $or: [ { _id: ObjectID(o._id) }, { obj_a: ObjectID(o._id) }, { obj_b: ObjectID(o._id) } ] };
                            mdb.collection('objects').find(query, { _id: 1 }).toArray(function(err, rows) {
                                if (!err) {
                                    async.each(rows, function(row, callback) {
                                        mdb.collection('objects').updateOne({ _id: ObjectID(row._id) }, { $set: { deleted: true }}, function (err, result) {
                                            if (!err) {
                                                sendToRoom(socket.room, JSON.stringify({act: 'delete_object', arg:row._id}));
                                            } else
                                                console.log(err);
                                        });
                                    }, function(err) {
                                        mdb.collection('objects').find({ $and: [ { mission_id: ObjectID(socket.mission_id) }, { deleted: { $ne: true } } ] }, { _id: 1 }).sort({ z: 1 }).toArray(function(err, rows) {
                                            var zs = rows.map(r => String(r._id));
                                            async.forEachOf(zs, function(item, index, callback) {
                                                var new_values = { $set: { z: index }};
                                                mdb.collection('objects').updateOne({ _id: ObjectID(item) }, new_values, function (err, result) {
                                                    if (err)
                                                        callback(err)
                                                    else
                                                        callback();
                                                });
                                            });
                                        });
                                    });
                                } else {
                                    console.log(err);
                                }
                            });
                        } else
                            socket.send(JSON.stringify({ act: 'error', arg: { text: 'Error: Permission denied. Changes not saved.' } }));
                        break;

                    case 'change_object':
                        var o = msg.arg;
                        if (socket.mission_permissions[socket.mission_id].modify_diagram && ajv.validate(validators.change_object, o)) {
                            o.name = xssFilters.inHTMLData(o.name);
                            o.fill_color = xssFilters.inHTMLData(o.fill_color);
                            o.stroke_color = xssFilters.inHTMLData(o.stroke_color);
                            o.image = xssFilters.inHTMLData(o.image);

                            var new_values = { $set: { name: o.name, fill_color: o.fill_color, stroke_color: o.stroke_color, image: o.image, locked: o.locked }};
                            mdb.collection('objects').updateOne({ _id: ObjectID(o._id) }, new_values, function (err, result) {
                                if (!err) {
                                    insertLogEvent(socket, 'Modified object: ' + o.name + ' ID: ' + o._id + '.');
                                    sendToRoom(socket.room, JSON.stringify({act: 'change_object', arg: msg.arg}));
                                } else {
                                    console.log(err);
                                }
                            });
                        } else {
                            socket.send(JSON.stringify({ act: 'error', arg: { text: 'Error: Permission denied. Changes not saved.' } }));
                        }
                        break;

                    case 'move_object':
                        if (socket.mission_permissions[socket.mission_id].modify_diagram) {
                            msg.arg.sort(dynamicSort('z'));
                            var args = []; // for x/y moves
                            var args_broadcast = []; // for z moves... to everyone
                            mdb.collection('objects').find({ mission_id: ObjectID(socket.mission_id), deleted: { $ne: true } }, { _id: 1, z: 1, name: 1 }).sort({ z: 1 }).toArray(function(err, rows) {
                                if (rows) {
                                    var zs = rows.map(r => String(r._id));
                                    async.eachOf(msg.arg, function(o, index, callback) {
                                        if (ajv.validate(validators.move_object, o)) {
                                            // move objects (z-axis)
                                            if (o.z !== zs.indexOf(o._id)) {
                                                o.z = Math.floor(o.z);
                                                zs.move(zs.indexOf(String(o._id)), o.z);
                                                async.forEachOf(zs, function(item, index, callback) {
                                                    var new_values = { $set: { z: index }};
                                                    mdb.collection('objects').updateOne({ _id: ObjectID(item) }, new_values, function (err, result) {
                                                        if (err)
                                                            callback(err);
                                                        else {
                                                            if (item === o._id)
                                                                args_broadcast.push(o);
                                                            callback();
                                                        }
                                                    });
                                                }, function(err) { // async callback
                                                    if (err)
                                                        callback(err);
                                                    else
                                                        callback();
                                                });
                                            // move objects (x/y axis)
                                            } else {
                                                o.x = Math.round(o.x);
                                                o.y = Math.round(o.y);
                                                var new_values = { $set: { x: o.x, y: o.y, scale_x: o.scale_x, scale_y: o.scale_y, rot: o.rot }};
                                                mdb.collection('objects').updateOne({ _id: ObjectID(o._id) }, new_values, function (err, result) {
                                                    if (err)
                                                        callback(err)
                                                    else
                                                        args.push(o);
                                                        callback();
                                                });
                                            }
                                        }
                                    }, function (err) { // async callback
                                        if (err)
                                            console.log(err);
                                        else {
                                            sendToRoom(socket.room, JSON.stringify({act: 'move_object', arg: args.concat(args_broadcast)}), socket);
                                            socket.send(JSON.stringify({act: 'move_object', arg: args_broadcast}));
                                        }
                                    });
                                } else { // no rows or error
                                    if (err) {
                                        console.log(err);
                                    }
                                }
                            });
                        } else
                            socket.send(JSON.stringify({ act: 'error', arg: { text: 'Error: Permission denied. Changes not saved.' } }));
                        break;

                    case 'change_link':
                        var o = msg.arg;
                        if (o.type !== undefined && o.type === 'link') {
                        }
                        break;
                    }
                }
            }
            if (msg.msgId !== undefined) {
                socket.send(JSON.stringify({act: 'ack', arg: msg.msgId}));
            }
        }
    });
}

app.get('/', function (req, res) {
    if (req.session.loggedin) {
            res.render('index', { title: 'ctfcop', permissions: JSON.stringify(req.session.cop_permissions) });
    } else {
       res.redirect('login');
    }
});

app.get('/logout', function (req, res) {
    req.session.destroy();
    res.redirect('login');
});

app.post('/api/alert', function(req, res) {
    msg = {};
    if (!req.body.mission_id || !ObjectID.isValid(req.body.mission_id) || !req.body.api || !req.body.channel || !req.body.text) {
        res.end('ERR');
        return;
    }
    msg.user_id = 0;
    msg.analyst = '';
    msg.channel = req.body.channel;
    msg.text = xssFilters.inHTMLData(req.body.text);
    msg.timestamp = (new Date).getTime();
    mdb.collection('users').findOne({ api: req.body.api, deleted: { $ne: true } }, function(err, row) {
        if (row) {
            msg.user_id = row._id;
            msg.username = row.username;

            mdb.collection('missions').aggregate([
                {
                    $match: { _id: ObjectID(req.body.mission_id), 'mission_users.user_id': ObjectID(msg.user_id), deleted: { $ne: true } }
                },{
                    $unwind: '$mission_users'
                },{
                    $match: { 'mission_users.user_id': ObjectID(msg.user_id) }
                },{
                    $project: {
                        permissions: '$mission_users.permissions',
                    }
                }
            ]).toArray(function(err, row) { 
                if (row) {
                    if(row[0].permissions.api_access) {
                        sendToRoom(req.body.mission_id, JSON.stringify({ act:'chat', arg: [msg] }));
                        res.end('OK');
                    }
                } else {
                     if (err)
                        console.log(err);
                    res.end('ERR');
                }
            });
        } else {
            if (err)
                console.log(err);
            res.end('ERR');
        }
    });
});

app.post('/api/:table', function (req, res) {
    if (!req.session.loggedin) {
        res.end('ERR4');
        return;
    }
    res.writeHead(200, {"Content-Type": "application/json"});
    // change password
    if (req.params.table !== undefined && req.params.table === 'change_password') {
        bcrypt.hash(req.body.newpass, null, null, function(err, hash) {
            mdb.collection('users').updateOne({ _id: ObjectID(req.session.user_id) }, { $set: { password: hash }}, function (err, result) {
                if (!err) {
                    res.end(JSON.stringify('OK'));
                } else {
                    res.end(JSON.stringify('ERR21'));
                    console.log(err);
                }
            });
        });

    } else {
        res.end(JSON.stringify('ERR22'));
    }
});

app.get('/config', function (req, res) {
    if (req.session.loggedin) {
        var profile = {};
        profile.username = req.session.username;
        profile.name = req.session.name;
        profile.user_id = req.session.user_id;
        profile.permissions = JSON.stringify(req.session.cop_permissions);
        res.render('config', { title: 'ctfcop', profile: profile, permissions: JSON.stringify(req.session.cop_permissions)});
    } else {
       res.redirect('login');
    }
});

function getPNGs(name) {
    return name.endsWith('.png');
}

app.get('/cop', function (req, res) {
    var icons = [];
    var shapes = [];
    var links = [];
    var mission_permissions = null;
    if (req.session.loggedin) {
        if (req.query.mission !== undefined && req.query.mission && ObjectID.isValid(req.query.mission)) {
            mdb.collection('missions').aggregate([
                {
                    $match: { _id: ObjectID(req.query.mission), 'mission_users.user_id': ObjectID(req.session.user_id), deleted: { $ne: true } }
                },{
                    $unwind: '$mission_users'
                },{
                    $match: { 'mission_users.user_id': ObjectID(req.session.user_id) }
                },{
                    $project: {
                        name: 1,
                        permissions: '$mission_users.permissions',
                    }
                }
            ]).toArray(function(err, row) {
                if (row && row.length > 0) {
                    fs.readdir('./public/images/icons', function(err, icons) {
                        fs.readdir('./public/images/shapes', function(err, shapes) {
                            fs.readdir('./public/images/links', function(err, links) {
                                var mission_name = row[0].name;
                                if (req.session.username === 'admin')
                                    mission_permissions =  { manage_users: true, modify_diagram: true, modify_notes: true, modify_files: true, api_access: true }; //admin has all permissions
                                else
                                    mission_permissions = row[0].permissions;
                                
                                req.session.mission_permissions[req.query.mission] = mission_permissions;

                                if (req.session.username === 'admin' || (mission_permissions && mission_permissions !== '')) // always let admin in
                                    res.render('cop', { title: 'ctfcop - ' + mission_name, permissions: JSON.stringify(mission_permissions), mission_name: mission_name, user_id: req.session.user_id, username: req.session.username, icons: icons.filter(getPNGs), shapes: shapes.filter(getPNGs), links: links.filter(getPNGs)});
                                else
                                    res.redirect('login');
                            });
                        });
                    });
                } else {
                     res.redirect('login');
                     if (err)
                        console.log(err);
                }
            });
        } else {
            res.redirect('../');
        }
    } else {
       res.redirect('login');
    }
});

app.post('/login', function (req, res) {
    if (req.body.username !== undefined && req.body.username !== '' && req.body.password !== undefined && req.body.password !== '') {
        mdb.collection('users').findOne({ username: { $eq: req.body.username }}, function(err, row) {
            if (row) {
                bcrypt.compare(req.body.password, row.password, function(err, bres) {
                    if (bres) {
                        req.session.user_id = row._id;
                        req.session.name = row.name;
                        req.session.username = row.username;
                        req.session.loggedin = true;
                        req.session.cop_permissions = row.permissions;
                        req.session.mission_permissions = {};
                        res.redirect('login');
                    } else {
                        res.render('login', { title: 'ctfcop', message: 'Invalid username or password.' });
                    }
                });
            } else {
                if (err) {
                    console.log(err);
                }
                res.render('login', { title: 'ctfcop', message: 'Invalid username or password.' });
            }
        });
    } else {
        res.render('login', { title: 'ctfcop', message: 'Invalid username or password.' });
    }
});

app.get('/login', function (req, res) {
    if (req.session.loggedin) {
        res.redirect('.');
    }
    else {
        res.render('login', { title: 'ctfcop Login' });
    }
});


// --------------------------------------- FILES ------------------------------------------
app.post('/dir/', function (req, res) {
    if (!req.session.loggedin) {
        res.end('ERR23');
        return;
    }
    var dir = req.body.id;
    var mission_id = req.body.mission_id;
    if (dir && mission_id && dir !== '#') {
        dir = path.normalize(dir).replace(/^(\.\.[\/\\])+/, '');
        dir = path.join(__dirname + '/mission_files/mission-' + mission_id, dir);
        var s = fs.statSync(dir);
        if (s.isDirectory()) {
            getDir(dir, mission_id, function(r) {
                res.send(r);
            })
        } else {
            res.status(404).send('Not found');
        }
    } else if (dir && mission_id) {
        dir = path.join(__dirname, '/mission_files/mission-' + mission_id);
        getDir(dir, mission_id, function(r) {
            res.send(r);
        });
    }
});

app.use('/download', express.static(path.join(__dirname, 'mission_files'), {
    etag: false,
    setHeaders: function(res, path) {
        res.attachment(path);
    }

}))

app.post('/mkdir', function (req, res) {
    if (!req.session.loggedin || !req.session.mission_permissions[req.body.mission_id].modify_files) {
        res.end('ERR24');
        return;
    }
    var id = req.body.id;
    var name = req.body.name;
    var mission_id = req.body.mission_id;
    if (id && name && mission_id) {
        var dir = path.normalize(id).replace(/^(\.\.[\/\\])+/, '');
        name = path.normalize('/' + name + '/').replace(/^(\.\.[\/\\])+/, '');
        dir = path.join(path.join(path.join(__dirname, '/mission_files/mission-' + mission_id + '/'), dir), name);
        fs.stat(dir, function (err, s) {
            if (err == null)
                res.status(500).send('mkdir error');
            else if (err.code == 'ENOENT') {
                fs.mkdir(dir,function(err){
                    if(err)
                        res.status(500).send('mkdir error');
                    else {
                        res.send('{}');
                        sendToRoom(req.body.mission_id, JSON.stringify({act: 'update_files', arg: null}));
                    }
               });
            } else {
                res.status(500).send('mkdir error');
            }
        });
    } else {
        res.status(404).send('Y U bein wierd?');
    }
});

app.post('/mv', function (req, res) {
    if (!req.session.loggedin || !req.session.mission_permissions[req.body.mission_id].modify_files) {
        res.end('ERR25');
        return;
    }
    var dst = req.body.dst;
    var src = req.body.src;
    var mission_id = req.body.mission_id;
    if (dst && src && mission_id) {
        var dstdir = path.normalize(dst).replace(/^(\.\.[\/\\])+/, '');
        var srcdir = path.normalize(src).replace(/^(\.\.[\/\\])+/, '');
        dstdir = path.join(path.join(__dirname, '/mission_files/mission-' + mission_id), dstdir);
        srcdir = path.join(path.join(__dirname, '/mission_files/mission-' + mission_id), srcdir);
        fs.stat(dstdir, function (err, s) {
            if (s.isDirectory()) {
                fs.stat(srcdir, function (err, s) {
                    if (s.isDirectory() || s.isFile()) {
                        fs.rename(srcdir, dstdir + '/' + path.basename(srcdir), function(err) {
                            if (err) {
                                res.status(500).send('mv error');
                            }
                            else {
                                res.send('{}');
                                sendToRoom(req.body.mission_id, JSON.stringify({act: 'update_files', arg: null}));
                            }
                        });
                    } else {
                        res.status(500).send('mv error');
                    }
                });
            } else {
                res.status(500).send('mv error');
            }
        });
    } else {
        res.status(404).send('Y U bein wierd?');
    }
});

app.post('/delete', function (req, res) {
    if (!req.session.loggedin || !req.session.mission_permissions[req.body.mission_id].modify_files) {
        res.end('ERR26');
        return;
    }
    var id = req.body.id;
    var mission_id = req.body.mission_id;
    if (id) {
        var dir = path.normalize(id).replace(/^(\.\.[\/\\])+/, '');
        dir = path.join(path.join(__dirname, '/mission_files/mission-' + mission_id + '/'), dir);
        fs.stat(dir, function (err, s) {
            if (err)
                res.status(500).send('delete error');
            if (s.isDirectory()) {
                fs.rmdir(dir,function(err){
                    if(err) {
                        res.status(500).send('delete error');
                    }
                    else {
                        res.send('{}');
                        sendToRoom(req.body.mission_id, JSON.stringify({act: 'update_files', arg: null}));
                    }
               });
            } else {
                fs.unlink(dir,function(err){
                    if(err) {
                        res.status(500).send('delete error');
                    }
                    else {
                        res.send('{}');
                        sendToRoom(req.body.mission_id, JSON.stringify({act: 'update_files', arg: null}));
                    }
               });
            }
        });
    } else
        res.status(404).send('Y U bein wierd?');
});

app.post('/upload', upload.any(), function (req, res) {
    if (!req.session.loggedin || !req.session.mission_permissions[req.body.mission_id].modify_files) {
        res.end('ERR27');
        return;
    }
    if (req.body.dir && req.body.dir.indexOf('_anchor') && req.body.mission_id) {
        var dir = req.body.dir.substring(0,req.body.dir.indexOf('_anchor'));
        dir = path.normalize(dir).replace(/^(\.\.[\/\\])+/, '');
        dir = path.join(__dirname + '/mission_files/mission-' + req.body.mission_id + '/', dir);
        async.each(req.files, function(file, callback) {
            fs.rename(file.path, dir + '/' + file.originalname, function(err) {
                if (err) {
                    res.status(500).send('upload error');
                }
                else {
                    callback();
                }
            });
        }, function() {
            res.send('{}');
            sendToRoom(req.body.mission_id, JSON.stringify({act: 'update_files', arg: null}));
        });
    } else {
       res.status(404).send('Y U bein wierd?');
    }
});

app.post('/avatar', upload.any(), function (req, res) {
    if (!req.session.loggedin || (!req.session.cop_permissions.manage_users && req.session.user_id !== req.body.id)) {
        res.end('ERR28');
        return;
    }
    if (req.body.id) {
        var dir = path.join(__dirname + '/public/images/avatars/');
        async.each(req.files, function(file, callback) {
            fs.rename(file.path, dir + '/' + req.body.id + '.png', function(err) {
                if (err) {
                    console.log(err);
                    res.status(500).send('upload error');
                }
                else {
                    callback();
                }
            });
        }, function() {
            mdb.collection('users').updateOne({ _id: ObjectID(req.body.id) }, { $set: { avatar: req.body.id + '.png' }}, function (err, result) {
                if (!err) {
                    res.end(JSON.stringify('OK'));
                } else {
                    console.log(err);
                    res.end(JSON.stringify('ERR21'));
                }
            });
        });
    } else {
       res.status(404).send('Y U bein wierd?');
    }
});

app.get("/images/avatars/*", function(req, res, next) {
    res.sendFile(path.join(__dirname, 'public/images/avatars/default.png'));
});

// -------------------------------------------------------------------------

http.listen(3000, function () {
    console.log('Server listening on port 3000!');
});
