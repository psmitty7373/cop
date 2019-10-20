// cop fqdn.  Don't include http, https, etc.
const url = 'www.ironrain.org'

// enable content security policy (this requires url to be set!)
const cspEnabled = false;

const Ajv = require('ajv');
const validators = require('./validators.js');
const express = require('express');
const app = express();
const pino = require('express-pino-logger')()
const async = require('async');
const bcrypt = require('bcrypt');
const bodyParser = require('body-parser');
const cookieParser = require('cookie-parser');
const crypto = require('crypto');
const fs = require('fs');
const http = require('http').Server(app);
const session = require('express-session');
const mongodb = require('mongodb').MongoClient;
const mongostore = require('connect-mongo')(session);
const mime = require('mime-types');
const readChunk = require('read-chunk');
const fileType = require('file-type');
const sharedbmongo = require('sharedb-mongo')
const multer = require('multer');
const objectid = require('mongodb').ObjectID;
const path = require('path');
const ShareDB = require('sharedb');
const richText = require('rich-text');
const rooms = new Map();
const graphs = new Map();
const upload = multer({
    dest: './temp_uploads'
});
const wsjsonstream = require('websocket-json-stream');
const xssFilters = require('xss-filters');
const wss = require('ws');
const ws = new wss.Server({
    server: http
});

var xml2js = require('xml2js');
var parser = new xml2js.Parser({explicitArray : false});
var builder = new xml2js.Builder({ renderOpts: { pretty: false }, headless: true });

app.set('view engine', 'pug');
app.use(express.static('public'));
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({
    extended: true
}));
//app.use(pino)
const logger = pino.logger;

// session-mongodb connection
app.use(session({
    secret: 'ProtextTheCybxers',
    name: 'session',
    saveUninitialized: true,
    resave: true,
    store: new mongostore({
        url: 'mongodb://localhost/cop',
        mongoOptions: {
            useNewUrlParser: true,
            useUnifiedTopology: true,
            reconnectTries: Number.MAX_VALUE,
            autoReconnect: true,
            wtimeout: 5000
        },
        host: 'localhost',
        collection: 'sessions',
        autoReconnect: true,
        clear_interval: 3600
    })
}));

if (cspEnabled) {
    app.use(function (req, res, next) {
        res.setHeader("Content-Security-Policy", "connect-src 'self' wss://" + url + " ws://" + url + "; worker-src 'self' https://" + url + " blob:; default-src 'unsafe-inline' 'unsafe-eval' 'self'; img-src 'self' data: blob:;");
        return next();
    });
}

// connect to mongo
var mdb;
const mongoclient = mongodb.connect('mongodb://localhost', {
    useNewUrlParser: true,
    useUnifiedTopology: true,
    reconnectTries: Number.MAX_VALUE,
    autoReconnect: true,
    wtimeout: 5000
}, (err, client) => {
    if (err) throw err;
    client.on('close', function () {
        logger.error('Connection to database closed. Error?');
        ws.clients.forEach(function each(socket) {
            socket.close();
        });
    });
    mdb = client.db('cop');
});

var backend = null;

// connect sharedb to mongo
mongodb.connect('mongodb://localhost', {
    useNewUrlParser: true,
    useUnifiedTopology: true,
    reconnectTries: Number.MAX_VALUE,
    autoReconnect: true,
    wtimeout: 5000
},(err, client) => {
    if (err) throw err;
    var db = client.db('cop');
    const sdb = new sharedbmongo({
        mongo: (cb) => { cb(null, db); }
    });

    // start sharedb
    ShareDB.types.register(richText.type);
    backend = new ShareDB({
        db: sdb,
        disableDocAction: true,
        disableSpaceDelimitedActions: true
    });

    backend.use('receive', function (r, c) {
        c();
    });
});

// setup ajv json validation
const ajv = new Ajv();

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

// https://ourcodeworld.com/articles/read/713/converting-bytes-to-human-readable-values-kb-mb-gb-tb-pb-eb-zb-yb-with-javascript
function readableBytes(bytes) {
    var i = Math.floor(Math.log(bytes) / Math.log(1024)),
    sizes = ['B', 'KB', 'MB', 'GB', 'TB', 'PB', 'EB', 'ZB', 'YB'];

    return (bytes / Math.pow(1024, i)).toFixed(2) * 1 + ' ' + sizes[i];
}

function dynamicSort(property) {
    var sortOrder = 1;
    if (property[0] === "-") {
        sortOrder = -1;
        property = property.substr(1);
    }
    return function (a, b) {
        var result = (a[property] < b[property]) ? -1 : (a[property] > b[property]) ? 1 : 0;
        return result * sortOrder;
    }
}

// send a message to all rooms
function sendToAllRooms(msg) {
    rooms.forEach((room) => {
        room.forEach((socket) => {
            if (socket && socket.readyState === socket.OPEN) {
                socket.send(msg);
            }
        });
    });
}

// send a message to all sockets in a room
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
                if (socket !== selfSocket) { // TODO: FIX && (!permRequired || socket.cop_permissions[permRequired])) {
                    socket.send(msg);
                }
            }
        });
    }
}

ws.on('connection', function (socket, req) {
    try {
        socket.loggedin = false;
        socket.session = '';
        socket.mission_id = 0;

        var s = req.headers.cookie.split('session=s%3A')[1].split('.')[0];
        if (s) {
            socket.session = s;
            mdb.collection('sessions').findOne({
                _id: s
            }, function (err, row) {
                if (row) {
                    try {
                        var data = JSON.parse(row.session);
                        socket.loggedin = data.loggedin;
                        socket.user_id = data.user_id;
                        socket.username = data.username;
                        socket.is_admin = data.is_admin;
                        socket.mission_permissions = data.mission_permissions;
                        setupSocket(socket);
                    } catch (err) {
                        logger.error(err);
                    }
                } else if (err)
                    logger.error(err);
            });
        }
        socket.isAlive = true;
    } catch (err) {
        logger.error(err);
        socket.close();
    }
});

// make sure sockets are still alive
const pingInterval = setInterval(function ping() {
    ws.clients.forEach(function each(socket) {
        if (socket.isAlive === false)
            return socket.terminate();
        socket.isAlive = false;
        socket.ping(function () {});
    });
}, 30000);

// MXGRAPH -------------------------------------------------------------------------------------------------------------------

// generate a blank mxGraph model in JS
var emptyGraphXML = `<mxGraphModel>
<root>
  <mxCell id="0"/>
  <mxCell id="1" parent="0"/>
</root>
</mxGraphModel>`;

var emptyGraph;
parser.parseStringPromise(emptyGraphXML).then(function(res) {
    emptyGraph = res;
}).catch (function (err) {
    logger.error(err);
})

async function loadGraph(mission_id) {
    // make sure graph is in memory
    if (graphs.get(mission_id)) {
        return true;
    }

    var mission = await mdb.collection('missions').findOne({
        _id: objectid(mission_id),
        deleted: {
            $ne: true
        }
    }, {
        projection: {
            graph: 1
        }
    });

    if (!mission.graph) {
        return false;
    }
    
    graphs.set(mission_id, JSON.parse(mission.graph));
    return true;
}

async function saveGraph(mission_id, graph) {
    try {
        var new_values = {};

        new_values.graph = JSON.stringify(graph);

        var res = await mdb.collection('missions').updateOne({
            _id: objectid(mission_id)
        }, {
            $set: new_values
        });
        return true;

    } catch (err) {
        logger.error(err);
        return false;
    }
}

function mxTerminalChange(js, graph) {
    for (var i = 0; i < graph.mxGraphModel.root.mxCell.length; i++) {
        if (graph.mxGraphModel.root.mxCell[i].$.id === js.mxTerminalChange.$.cell) {
            if (js.mxTerminalChange.$.source == 1) {
                if (js.mxTerminalChange.$.terminal) {
                    graph.mxGraphModel.root.mxCell[i].$.source = js.mxTerminalChange.$.terminal;
                } else {
                    delete graph.mxGraphModel.root.mxCell[i].$.source;
                }
            } else {
                if (js.mxTerminalChange.$.terminal) {
                    graph.mxGraphModel.root.mxCell[i].$.target = js.mxTerminalChange.$.terminal;
                } else {
                    delete graph.mxGraphModel.root.mxCell[i].$.target;
                }
            }
            break;
        }
    }
    return js;
}

function mxGeometryChange(js, graph) {
    for (var i = 0; i < graph.mxGraphModel.root.mxCell.length; i++) {
        if (graph.mxGraphModel.root.mxCell[i].$.id === js.mxGeometryChange.$.cell) {
            graph.mxGraphModel.root.mxCell[i].mxGeometry = js.mxGeometryChange.mxGeometry;
            break;
        }
    }
    return js;
}

function mxValueChange(js, graph) {
    js.mxValueChange.$.value = xssFilters.inHTMLData(js.mxValueChange.$.value);
    for (var i = 0; i < graph.mxGraphModel.root.mxCell.length; i++) {
        if (graph.mxGraphModel.root.mxCell[i].$.id === js.mxValueChange.$.cell) {
            graph.mxGraphModel.root.mxCell[i].$.value = js.mxValueChange.$.value;
            break;
        }
    }
    return js;
}

function mxStyleChange(js, graph) {
    for (var i = 0; i < graph.mxGraphModel.root.mxCell.length; i++) {
        if (graph.mxGraphModel.root.mxCell[i].$.id === js.mxStyleChange.$.cell) {
            graph.mxGraphModel.root.mxCell[i].$.style = js.mxStyleChange.$.style;
            break;
        }
    }
    return js;
}

function mxRootChange(js, graph) {
    graph.mxGraphModel.root.mxCell = js.mxRootChange.mxCell;
    return '';
}

function mxChildChange(js, graph) {
    // delete
    if (js.mxChildChange.$ && js.mxChildChange.$.parent === undefined) {
        for (var i = 0; i < graph.mxGraphModel.root.mxCell.length; i++) {
            if (js.mxChildChange.$ && graph.mxGraphModel.root.mxCell[i].$.id === js.mxChildChange.$.child) {
                graph.mxGraphModel.root.mxCell.splice(i, 1);
                break;
            }
        }
    // move
    } else if (js.mxChildChange.$ && js.mxChildChange.$.index && js.mxChildChange.$.child) {
        for (var i = 0; i < graph.mxGraphModel.root.mxCell.length; i++) {
            if (js.mxChildChange.$ && graph.mxGraphModel.root.mxCell[i].$.id === js.mxChildChange.$.child) {
                graph.mxGraphModel.root.mxCell.move(i, js.mxChildChange.$.index);
                break;
            }
        }
    // insert
    } else if (js.mxChildChange.mxCell) {
        graph.mxGraphModel.root.mxCell.push(js.mxChildChange.mxCell);
    }
    return js;
}
// ------------------------------------------------------------------------------------------------------------------- MXGRAPH

// USERS -------------------------------------------------------------------------------------------------------------------
// get user listing
async function getUsers(socket, limited) {
    try {
        var projection = {
            password: 0,
            deleted: 0
        };
        if (limited) {
            projection.api = 0;
            projection.avatar = 0;
            projection.name = 0;
            projection.permissions = 0;
            projection.is_admin = 0;
        }

        var users = await mdb.collection('users').find({
            deleted: {
                $ne: true
            }
        }, {
            projection: projection
        }).toArray();

        socket.send(JSON.stringify({
            act: 'get_users',
            arg: users
        }));

    } catch (err) {
        socket.send(JSON.stringify({
            act: 'error',
            arg: {
                text: 'Error getting users.'
            }
        }));
        socket.send(JSON.stringify({
            act: 'get_users',
            arg: []
        }));
        logger.error(err);
    }
}

// insert new user
async function insertUser(socket, user) {
    try {
        var hash = await bcrypt.hash(user.password, 10);
        var new_values = {};
        new_values.username = xssFilters.inHTMLData(user.username);
        new_values.name = xssFilters.inHTMLData(user.name);
        new_values.password = hash;
        new_values.api = crypto.randomBytes(32).toString('hex');
        new_values.avatar = '';
        new_values.deleted = false;
        new_values.is_admin = user.is_admin;
    
        var res = await mdb.collection('users').insertOne(new_values);

        var channel = { _id: objectid(res.ops[0]._id), name: '', deleted: false, type: 'user', members: [objectid(res.ops[0]._id)] };
        await mdb.collection('channels').insertOne(channel);

        res.ops[0].password = '';
        sendToRoom('config', JSON.stringify({
            act: 'insert_user',
            arg: res.ops[0]
        }));

    } catch (err) {
        socket.send(JSON.stringify({
            act: 'error',
            arg: {
                text: 'Error inserting user.'
            }
        }));
        logger.error(err);
    }
}

// update user
async function updateUser(socket, user) {
    try {
        if (user.name === 'admin') {
            user.is_admin = true; // make sure admin is always... admin            
        }

        var new_values = {};
        if (user.password && user.password !== '') {
            new_values.password = await bcrypt.hash(user.password, 10);
        }

        new_values.name = user.name;
        new_values.is_admin = user.is_admin;

        var res = await mdb.collection('users').updateOne({
            _id: objectid(user._id)
        }, {
            $set: new_values
        });
        if (res.result.ok === 1) {
            delete user.username;
            delete user.api;
            user.password = '';

            sendToRoom('config', JSON.stringify({
                act: 'update_user',
                arg: user
            }));

            if (new_values.password) {
                socket.send(JSON.stringify({
                    act: 'error',
                    arg: {
                        text: 'Password changed!'
                    }
                }));
            }
        } else {
            throw('updateUser error.');
        }
    } catch (err) {
        socket.send(JSON.stringify({
            act: 'error',
            arg: {
                text: 'Error updating user.'
            }
        }));
        logger.error(err);
    }
}

// delete user
async function deleteUser(socket, user) {
    try {
        var res = await mdb.collection('users').updateOne({
            _id: objectid(user._id)
        }, {
            $set: {
                deleted: true
            }
        });
        if (res.result.ok === 1) {
            sendToRoom('config', JSON.stringify({
                act: 'delete_user',
                arg: user._id
            }));
        } else {
            throw('deleteUser error.');
        }

    } catch (err) {
        socket.send(JSON.stringify({
            act: 'error',
            arg: {
                text: 'Error deleting user.'
            }
        }));
        logger.error(err);
    }
}
// -------------------------------------------------------------------------------------------------------------------/USERS

// MISSIONS -------------------------------------------------------------------------------------------------------------------
// get all missions (based on perms)
async function getMissions(socket) {
    try {
        var missions = await mdb.collection('missions').aggregate([{
            $match: {
                deleted: {
                    $ne: true
                }
            }
        }, {
            $lookup: {
                from: 'users',
                localField: 'user_id',
                foreignField: '_id',
                as: 'username'
            },
        }, {
            $project: {
                _id: 1,
                name: 1,
                start_date: 1,
                username: '$username.username'
            }
        }]).toArray();

        socket.send(JSON.stringify({
            act: 'get_missions',
            arg: missions
        }));

    } catch (err) {
        socket.send(JSON.stringify({
            act: 'error',
            arg: {
                text: 'Error getting missions.'
            }
        }));
        socket.send(JSON.stringify({
            act: 'get_missions',
            arg: []
        }));
        logger.error(err);
    }
}

// insert mission
async function insertMission(socket, mission) {
    try {
        mission.name = xssFilters.inHTMLData(mission.name);

        var filesRoot = objectid(null);
        var chatFilesRoot = objectid(null);
        var logChannel = objectid(null);
        var mission = {
            graph: JSON.stringify(emptyGraph),
            name: mission.name,
            user_id: objectid(socket.user_id),
            mission_users: [],
            log_channel: logChannel,
            files_root: filesRoot,
            chat_files_root: chatFilesRoot,
            files: [{ _id: filesRoot, name: '/', parent_id: '#', type: 'dir', level: 0, protected: true }, { _id: chatFilesRoot, name: 'chat_files', parent_id: filesRoot, type: 'dir', level: 1, protected: true }],
            deleted: false
        };

        mission.mission_users[0] = {
            _id: objectid(null),
            user_id: objectid(socket.user_id),
            permissions: {
                manage_users: true,
                write_access: true,
                delete_access: true,
                api_access: true
            }
        };
        
        var res = await mdb.collection('missions').insertOne(mission);
        res.ops[0].username = socket.username;

        // create default chat channels
        var channels = [{ _id: logChannel, mission_id: objectid(res.ops[0]._id), name: 'log', deleted: false, type: 'channel', members: [objectid(socket.user_id)] }, { _id: objectid(null), mission_id: objectid(res.ops[0]._id), name: 'general', deleted: false, type: 'channel', members: [objectid(socket.user_id)] }];
        await mdb.collection('channels').insert(channels);

        sendToRoom('main', JSON.stringify({
            act: 'insert_mission',
            arg: res.ops[0]
        }));

    } catch (err) {
        socket.send(JSON.stringify({
            act: 'error',
            arg: {
                text: 'Error inserting mission.'
            }
        }));
        logger.error(err);
    }
}

// update mission
async function updateMission(socket, mission) {
    try {
        mission.name = xssFilters.inHTMLData(mission.name);
        var new_values = {
            $set: {
                name: mission.name
            }
        };
    
        var res = await mdb.collection('missions').updateOne({
            _id: objectid(mission._id)
        }, new_values);
        if (res.result.ok === 1) {
            sendToRoom('main', JSON.stringify({
                act: 'update_mission',
                arg: mission
            }));
        } else {
            throw('updateMission error.')
        }

    } catch (err) {
        logger.error(err);
        socket.send(JSON.stringify({
            act: 'error',
            arg: {
                text: 'Error updating mission.'
            }
        }));
    }
}

// delete mission
async function deleteMission(socket, mission) {
    try {
        var res = await mdb.collection('missions').updateOne({
            _id: objectid(mission._id)
        }, {
            $set: {
                deleted: true
            }
        });

        if (res.result.ok === 1) {
            sendToRoom('main', JSON.stringify({
                act: 'delete_mission',
                arg: mission._id
            }));
        } else {
            throw('deleteMission error.')
        }

    } catch (err) {
        logger.error(err);
        socket.send(JSON.stringify({
            act: 'error',
            arg: {
                text: 'Error deleting mission.'
            }
        }));
    }
}
// ------------------------------------------------------------------------------------------------------------------- /MISSIONS

// CHATS -------------------------------------------------------------------------------------------------------------------
// get chats
async function getChatChannels(socket) {
    try {
        var channels = await mdb.collection('channels').find({
            mission_id: objectid(socket.mission_id),
            members: { $in: [ objectid(socket.user_id) ]},
            deleted: {
                $ne: true
            }
        }).toArray();

        var projection = {
            password: 0,
            deleted: 0,
            api: 0,
            avatar: 0,
            name: 0,
            permissions: 0,
            is_admin: 0
        }

        var users = await mdb.collection('users').find({
            deleted: {
                $ne: true
            }
        }, {
            projection: projection
        }).toArray();

        for (var i = 0; i < users.length; i++) {
            users[i].status = 'offline';
            if (users[i]._id == socket.user_id || (rooms.get(users[i]._id.toString()) && rooms.get(users[i]._id.toString()).size > 0)) {
                users[i].status = 'online';
            }
        }

        for (var i = 0; i < users.length; i++) {
            channels.push({ _id: users[i]._id, name: users[i].username, type: 'user', status: users[i].status });
        }

        socket.send(JSON.stringify({
            act: 'get_channels',
            arg: channels
        }));

        return channels;

    } catch (err) {
        socket.send(JSON.stringify({
            act: 'error',
            arg: {
                text: 'Error getting chat channels.'
            }
        }));
        socket.send(JSON.stringify({
            act: 'get_channels',
            arg: []
        }));
        logger.error(err);

        return [];
    }
}

// add new chat channel
async function insertChatChannel(socket, channel) {
    try {
        // check if channel already exists
        var count = await mdb.collection('channels').count({
            mission_id: objectid(socket.mission_id),
            'channels.name': channel.name
        });

        // don't add existing channel
        if (count === 0) {
            var new_values = {
                _id: objectid(null),
                name: channel.name,
                deleted: false,
                type: 'channel'
            };

            var res = await mdb.collection('missions').updateOne({
                _id: objectid(socket.mission_id)
            }, {
                $push: {
                    channels: new_values
                }
            });

            if (res.result.ok === 1) {
                sendToRoom(socket.mission_id, JSON.stringify({
                    act: 'insert_chat_channel',
                    arg: [new_values]
                }));

            } else {
                throw('insertChatChannel error.')
            }
        } else {
            throw('insertChatChannel already exists.')
        }
    } catch (err) {
        socket.send(JSON.stringify({
            act: 'error',
            arg: {
                text: 'Error inserting channel. Already exists?'
            }
        }));
        logger.error(err);
    }
}

// get 50 most recent messages for chat
async function getChats(socket, channels) {
    try {
        var chats = [];

        for (var i = 0; i < channels.length; i++) {
            var match = {};
            if (channels[i].type === 'user') {
                match = {
                    $or: [
                        {
                            $and: [{ channel_id: objectid(socket.user_id) }, { user_id: objectid(channels[i]._id) }]
                        },
                        {
                            $and: [{ channel_id: objectid(channels[i]._id) }, { user_id: objectid(socket.user_id) }]
                        }, 
                    ],
                    deleted: {
                        $ne: true
                    }
                }
            } else {
                match = {
                    channel_id: objectid(channels[i]._id),
                    deleted: {
                        $ne: true
                    }
                }
            }
        
            var rows = await mdb.collection('chats').aggregate([{
                $match: match
            }, {
                $sort: {
                    timestamp: -1
                }
            }, {
                $limit: 50
            }, {
                $sort: {
                    timestamp: 1
                }
            }, {
                $lookup: {
                    from: 'users',
                    localField: 'user_id',
                    foreignField: '_id',
                    as: 'username'
                }
            }, {
                $project: {
                    _id: 1,
                    user_id: 1,
                    channel_id: objectid(channels[i]._id),
                    text: 1,
                    timestamp: 1,
                    username: '$username.username'
                }
            }]).sort({ timestamp: 1 }).toArray();

            if (rows) {
                if (rows.length == 50) {
                    rows[0].more = 1;
                }
                chats = chats.concat(rows);
            }
        }
        

        socket.send(JSON.stringify({
            act: 'get_chats',
            arg: chats
        }));

    } catch (err) {
        socket.send(JSON.stringify({
            act: 'error',
            arg: {
                text: 'Error getting chats.'
            }
        }));
        socket.send(JSON.stringify({
            act: 'get_chats',
            arg: []
        }));
        logger.error(err);
    }
}

async function insertLogEvent(socket, chat, filter) {
    if (filter === undefined) {
        filter = true;
    }
    try {
        if (!chat.channel_id || chat.channel_id === '') {
            var logChannel = await mdb.collection('missions').findOne({
                _id: objectid(socket.mission_id),
                deleted: {
                    $ne: true
                }
            });

            if (!logChannel) {
                throw('insertLogEvent error.  Could not find log channel.')
            }
            chat.channel_id = logChannel.log_channel.toString();
            chat.type = 'channel';
        }

        insertChat(socket, chat, filter);

    } catch (err) {
        logger.error(err);
    }
}

// insert chat
async function insertChat(socket, chat, filter) {
    if (filter === undefined) {
        filter = true;
    }
    
    try {
        chat.username = socket.username;
        chat.user_id = socket.user_id;
        if (filter) {
            chat.text = xssFilters.inHTMLData(chat.text);
        }
        chat.timestamp = (new Date).getTime();

        var count = await mdb.collection('channels').count({
            _id: objectid(chat.channel_id)
        });

        if (count !== 1) {
            throw('insertChat error.  Invalid channel.');
        }

        var chat_row = {
            _id: objectid(null),
            user_id: objectid(socket.user_id),
            channel_id: objectid(chat.channel_id),
            text: chat.text,
            timestamp: chat.timestamp,
            deleted: false
        };

        var res = await mdb.collection('chats').insertOne(chat_row);

        chat._id = res.ops[0]._id;

        // if private chat, send to both parties
        if (chat.type === 'user' && chat.channel_id !== chat.user_id) {
            // send message to sender (dup)
            sendToRoom(chat.user_id, JSON.stringify({
                act: 'chat',
                arg: [chat]
            }));

            
            // send message to receiver
            var tchannel_id = chat.channel_id;
            chat.channel_id = socket.user_id;
            sendToRoom(tchannel_id, JSON.stringify({
                act: 'chat',
                arg: [chat]
            }));
        } else {
            // send to channel
            sendToRoom(chat.channel_id, JSON.stringify({
                act: 'chat',
                arg: [chat]
            }));
        }
    } catch (err) {
        socket.send(JSON.stringify({
            act: 'error',
            arg: {
                text: 'Error inserting chat.'
            }
        }));
        logger.error(err);
    }
}

// delete chat
async function deleteChat(socket, chat) {
    try {
        var tchat = await mdb.collection('chats').findOne({
            _id: objectid(chat._id),
            user_id: objectid(socket.user_id),
            deleted: {
                $ne: true
            }
        });

        if (!tchat) {
            throw ('deleteChat error. Chat does not exist.');
        }

        if (!socket.is_admin && socket.user_id != tchat.user_id) {
            throw('deleteChat error. Permission denied.');
        }

        var res = await mdb.collection('chats').updateOne({
            _id: objectid(chat._id)
        }, {
            $set: {
                deleted: true
            }
        });

        if (res.result.ok === 1) {
            sendToRoom(tchat.channel_id.toString(), JSON.stringify({
                act: 'delete_chat',
                arg: chat._id
            }));
        } else {
            throw('delete_chat error.')
        }

    } catch (err) {
        logger.error(err);
        socket.send(JSON.stringify({
            act: 'error',
            arg: {
                text: 'Error deleting chat.'
            }
        }));
    }
}

// get old chats
async function getOldChats(socket, request) {
    try {
        var rows = await mdb.collection('chats').aggregate([{
            $match: {
                mission_id: objectid(socket.mission_id),
                channel_id: objectid(request.channel_id),
                timestamp: {
                    $lt: parseInt(request.start_from)
                },
                deleted: {
                    $ne: true
                }
            }
        }, {
            $sort: {
                timestamp: -1
            }
        }, {
            $limit: 50
        }, {
            $lookup: {
                from: 'users',
                localField: 'user_id',
                foreignField: '_id',
                as: 'username'
            }
        }, {
            $project: {
                _id: 1,
                user_id: 1,
                channel_id: 1,
                text: 1,
                timestamp: 1,
                username: '$username.username'
            }
        }]).toArray();

        if (rows) {
            if (rows.length == 50)
                if (request.start_from !== undefined && !isNaN(request.start_from))
                    rows[49].more = 1;
                else
                    rows[0].more = 1;
            socket.send(JSON.stringify({
                act: 'bulk_chat',
                arg: rows
            }));

        } else {
            socket.send(JSON.stringify({
                act: 'bulk_chat',
                arg: []
            }));
        }
    } catch (err) {
        socket.send(JSON.stringify({
            act: 'error',
            arg: {
                text: 'Error getting old chats.'
            }
        }));
        logger.error(err);
    }
}
// ------------------------------------------------------------------------------------------------------------------- /CHATS

// mission_user -------------------------------------------------------------------------------------------------------------------
// get mission users
async function getMissionUsers(socket) {
    try {
        var users = await mdb.collection('missions').aggregate([{
            $match: {
                _id: objectid(socket.mission_id),
                deleted: {
                    $ne: true
                }
            }
        }, {
            $unwind: '$mission_users'
        }, {
            $lookup: {
                from: 'users',
                localField: 'mission_users.user_id',
                foreignField: '_id',
                as: 'user'
            }
        }, {
            $project: {
                _id: '$mission_users._id',
                user_id: '$mission_users.user_id',
                username: {
                    $arrayElemAt: ['$user.username', 0]
                },
                permissions: '$mission_users.permissions',
            }
        }]).toArray();

        socket.send(JSON.stringify({
            act: 'get_mission_users',
            arg: users
        }));

    } catch (err) {
        socket.send(JSON.stringify({
            act: 'error',
            arg: {
                text: 'Error getting mission users.'
            }
        }));
        socket.send(JSON.stringify({
            act: 'get_mission_users',
            arg: []
        }));
        logger.error(err);
    }
}

// add user to a mission
async function insertMissionUser(socket, user) {
    try {
        var count = await mdb.collection('missions').count({
            _id: objectid(socket.mission_id),
            'mission_users.user_id': objectid(user.user_id)
        });

        // don't let the user make the same user setting over again
        if (count === 0) {
            var new_values = {
                _id: objectid(null),
                user_id: objectid(user.user_id),
                permissions: user.permissions
            };

            var res = await mdb.collection('missions').updateOne({
                _id: objectid(socket.mission_id)
            }, {
                $push: {
                    mission_users: new_values
                }
            });

            var res2 = await mdb.collection('channels').updateMany({
                mission_id: objectid(socket.mission_id),
                deleted: {
                    $ne: true
                }
            }, {
                $push: {
                    members: objectid(user.user_id)
                }
            });

            if (res.result.ok === 1) {
                // get username
                var user = await mdb.collection('users').findOne({
                    _id: objectid(user.user_id),
                    deleted: {
                        $ne: true
                    }
                });
                new_values.username = user.username;
                sendToRoom(socket.mission_id, JSON.stringify({
                    act: 'insert_mission_user',
                    arg: new_values
                }));

            } else {
                throw('insertMissionUser error.')
            }

        } else {
            throw('insertMissionUser error.')
        }
    } catch (err) {
        socket.send(JSON.stringify({
            act: 'error',
            arg: {
                text: 'Error inserting user in mission.'
            }
        }));
        logger.error(err);
    }
}

// update user in mission
async function updateMissionUser(socket, user) {
    try {
        var new_values = {
            'mission_users.$.user_id': objectid(user.user_id),
            'mission_users.$.permissions': user.permissions
        };
        var res = await mdb.collection('missions').updateOne({
            _id: objectid(socket.mission_id),
            'mission_users._id': objectid(user._id)
        }, {
            $set: new_values
        });
        if (res.result.ok === 1) {
            var ouser = await mdb.collection('users').findOne({
                _id: objectid(user.user_id),
                deleted: {
                    $ne: true
                }
            });
            user.username = ouser.username;
            sendToRoom(socket.mission_id, JSON.stringify({
                act: 'update_mission_user',
                arg: user
            }));

            insertLogEvent(socket, { text: 'Modified user setting ID: ' + user._id + '.' });

        } else {
            throw('updateMissionUser error.')
        }

    } catch (err) {
        socket.send(JSON.stringify({
            act: 'error',
            arg: {
                text: 'Error updating mission user.'
            }
        }));
        logger.error(err);
    }
}

// delete user from mission
async function deleteMissionUser(socket, user) {
    try {
        var res = await mdb.collection('missions').findOneAndUpdate({
            _id: objectid(socket.mission_id)
        }, {
            $pull: {
                mission_users: {
                    _id: objectid(user._id)
                }
            }
        });
        if (res.ok === 1) {
            sendToRoom(socket.mission_id, JSON.stringify({
                act: 'delete_mission_user',
                arg: user._id
            }));
        } else {
            throw('deleteMissionUser error.')
        }

    } catch (err) {
        socket.send(JSON.stringify({
            act: 'error',
            arg: {
                text: 'Error deleting user from mission.'
            }
        }));
        logger.error(err);
    }
}
// ------------------------------------------------------------------------------------------------------------------- /mission_user

// FILES -------------------------------------------------------------------------------------------------------------------

// get files
async function getFiles(socket) {
    var dir = path.join(__dirname + '/mission_files/');
    try {
        // make sure directory exists for mission files
        fs.statSync(dir, function (err, s) {
            if (err == null) {} else if (err.code == 'ENOENT') {
                fs.mkdir(dir, function (err) {
                    if (err) {
                        throw(err);
                    }
                });
            } else {
                throw(err);
            }
        });

        var files = await mdb.collection('missions').aggregate([{
            $match: {
                _id: objectid(socket.mission_id),
                deleted: {
                    $ne: true
                }
            }
        }, {
            $unwind: '$files'
        }, {
            $match: { 
                'files.deleted': {
                    $ne: true
                }
            }
        }, {
            $project: {
                _id: '$files._id',
                parent_id: '$files.parent_id',
                name: '$files.name',
                type: '$files.type',
                level: '$files.level',
                protected: '$files.protected'
            }
        }]).sort({
            level: 1, name: 1
        }).toArray();

        socket.send(JSON.stringify({
            act: 'get_files',
            arg: files
        }));

    } catch (err) {
        socket.send(JSON.stringify({
            act: 'error',
            arg: {
                text: 'Error getting files.'
            }
        }));
        socket.send(JSON.stringify({
            act: 'get_files',
            arg: []
        }));
        logger.error(err);
    }
}

async function insertFile(socket, file, allowDupName) {
    if (allowDupName === undefined) {
        allowDupName = false;
    }
    try {
        if (file.type === 'dir') {
            file.name = xssFilters.inHTMLData(file.name).replace(/\//g,'').replace(/\\/g,'');
        }

        var res = [];
        var match = {};
        // check if the same file already exists with the same hash and same name
        if (allowDupName) {
            match = {
                'files.hash': file.hash,
                'files.name': file.name,
                'files.parent_id': objectid(file.parent_id),
                'files.deleted': {
                    $ne: true
                }
            }

        // check if a file with the same name already exists under this parent
        } else {
            match = {
                'files.name': file.name,
                'files.parent_id': objectid(file.parent_id),
                'files.deleted': {
                    $ne: true
                }
            }
        }

        var res = await mdb.collection('missions').aggregate([{
            $match: {
                _id: objectid(socket.mission_id),
                deleted: {
                    $ne: true
                }
            }
        }, {
            $unwind: '$files'
        }, {
            $match: match
        }, {
            $project: {
                _id: '$files._id',
                parent_id: '$files.parent_id',
                level: '$files.level'
            }
        }]).toArray();

        // get parent level
        var parent = await mdb.collection('missions').aggregate([{
            $match: {
                _id: objectid(socket.mission_id),
                deleted: {
                    $ne: true
                }
            }
        }, {
            $unwind: '$files'
        }, {
            $match: { 
                'files._id': objectid(file.parent_id),
                'files.deleted': {
                    $ne: true
                }
            }
        }, {
            $project: {
                _id: '$files._id',
                parent_id: '$files.parent_id',
                level: '$files.level'
            }
        }]).toArray();

        // file doesn't exist
        if (res.length === 0) {
            var new_id = objectid(null);
            var new_value = {
                _id: new_id,
                name: file.name,
                parent_id: objectid(file.parent_id),
                type: file.type,
                level: parent[0].level + 1,
                hash: file.hash,
                protected: false
            };

            if (file.type === 'file') {
                new_value.realName = file.realName;
            }

            res = await mdb.collection('missions').updateOne({
                _id: objectid(socket.mission_id)
            }, {
                $push: {
                    files: new_value
                }
            });

            if (res.result.ok === 1) {
                sendToRoom(socket.mission_id, JSON.stringify({
                    act: 'insert_file',
                    arg: new_value
                }));
            } else {
                throw('insertFile error.')
            }

            return new_id;
        }
 
        // file already exists
        else if(file.type === 'file') {
            //TO-DO: cleanup old file?

            file._id = res[0]._id;

            var new_values = {
                'files.$.realName': file.realName,
                hash: file.hash
            };

            var res = await mdb.collection('missions').updateOne({
                _id: objectid(socket.mission_id),
                'files._id': objectid(file._id)
            }, {
                $set: new_values
            });

            if (res.result.ok === 1) {
                sendToRoom(socket.mission_id, JSON.stringify({
                    act: 'update_file',
                    arg: file
                }));
                insertLogEvent(socket, { text: 'Modified file ID: ' + file._id + '.' });
            } else {
                throw('insertFile error.')
            }

            return file._id;
        } else {
            throw('insertFile error.')
        }

    } catch (err) {
        socket.send(JSON.stringify({
            act: 'error',
            arg: {
                text: 'Error creating directory.'
            }
        }));
        logger.error(err);

        return null;
    }
}

async function moveFile(socket, file) {
    var real = path.join(__dirname, '/mission_files/');
    file.name = xssFilters.inHTMLData(file.name).replace(/\//g,'').replace(/\\/g,'');
    try {
        // get parent level
        var parent = await mdb.collection('missions').aggregate([{
            $match: {
                _id: objectid(socket.mission_id),
                deleted: {
                    $ne: true
                }
            }
        }, {
            $unwind: '$files'
        }, {
            $match: { 
                'files._id': objectid(file.parent_id),
                'files.deleted': {
                    $ne: true
                }
            }
        }, {
            $project: {
                _id: '$files._id',
                parent_id: '$files.parent_id',
                level: '$files.level'
            }
        }]).toArray();

        var new_values = {
            'files.$.parent_id': objectid(file.parent_id),
            'files.$.name': file.name,
            'files.$.level': parent[0].level + 1
        };

        var res = await mdb.collection('missions').updateOne({
            _id: objectid(socket.mission_id),
            files: { $elemMatch: { _id: objectid(file._id), protected: false } }
        }, {
            $set: new_values
        });

        if (res.result.nModified === 1) {
            sendToRoom(socket.mission_id, JSON.stringify({
                act: 'update_file',
                arg: file
            }));
            insertLogEvent(socket, { text: 'Modified file ID: ' + file._id + '.' });

        } else {
            throw('moveFile error.')
        }

    } catch (err) {
        socket.send(JSON.stringify({
            act: 'error',
            arg: {
                text: 'Error updating file.'
            }
        }));
        logger.error(err);
    }
}

async function deleteFile(socket, file) {
    try {
        var res = await mdb.collection('missions').updateMany({
            _id: objectid(socket.mission_id)
        }, {
            $pull: {
                files: {
                    $or: [{ _id: objectid(file._id) }, { parent_id: objectid(file._id) }]
                }
            }
        });

        if (res.result.ok === 1) {
            sendToRoom(socket.mission_id, JSON.stringify({
                act: 'delete_file',
                arg: file._id
            }));

        } else {
            throw('deleteFile error.')
        }
    } catch (err) {
        socket.send(JSON.stringify({
            act: 'error',
            arg: {
                text: 'Error deleting file.'
            }
        }));
        logger.error(err);
    }

}

// ------------------------------------------------------------------------------------------------------------------- /FILES

// NOTES -------------------------------------------------------------------------------------------------------------------
// get notes list
async function getNotes(socket) {
    try {
        var projection = {
            _id: 1,
            name: 1
        };

        var notes = await mdb.collection('notes').find({
            $and: [{
                mission_id: objectid(socket.mission_id)
            }, {
                deleted: {
                    $ne: true
                }
            }]
        },{ projection: projection }).sort({
            name: 1
        }).toArray();

        for (var i = 0; i < notes.length; i++) {
            notes[i].type = 'note';
        }

        socket.send(JSON.stringify({
            act: 'get_notes',
            arg: notes
        }));

    } catch (err) {
        socket.send(JSON.stringify({
            act: 'error',
            arg: {
                text: 'Error getting notes.'
            }
        }));
        socket.send(JSON.stringify({
            act: 'get_notes',
            arg: []
        }));
        logger.error(err);
    }
}

async function insertNote(socket, note) {
    note.name = xssFilters.inHTMLData(note.name);
    var note_row = {
        mission_id: objectid(socket.mission_id),
        name: note.name,
        deleted: false
    };
    try {
        var res = await mdb.collection('notes').insertOne(note_row);
        insertLogEvent(socket, { text: 'Created note: ' + note.name + '.' });
        sendToRoom(socket.mission_id, JSON.stringify({
            act: 'insert_note',
            arg: {
                _id: note_row._id,
                name: note.name,
                type: 'note'
            }
        }));

    } catch (err) {
        socket.send(JSON.stringify({
            act: 'error',
            arg: {
                text: 'Error inserting note.'
            }
        }));
        logger.error(err);
    }
}

async function updateNote(socket, note) {
    note.name = xssFilters.inHTMLData(note.name);
    var new_values = {
        $set: {
            name: note.name
        }
    };
    try {
        var res = await mdb.collection('notes').updateOne({
            _id: objectid(note._id)
        }, new_values);
        insertLogEvent(socket, { text: 'Renamed note: ' + note._id + ' to: ' + note.name + '.' });
        sendToRoom(socket.mission_id, JSON.stringify({
            act: 'update_note',
            arg: {
                _id: note._id,
                name: note.name
            }
        }));

    } catch (err) {
        socket.send(JSON.stringify({
            act: 'error',
            arg: {
                text: 'Error renaming note.'
            }
        }));
        logger.error(err);
    }
}

async function deleteNote(socket, note) {
    try {
        var res = mdb.collection('notes').updateOne({
            _id: objectid(note._id)
        }, {
            $set: {
                deleted: true
            }
        });
        insertLogEvent(socket, { text: 'Deleted note: ' + note._id + '.' });
        sendToRoom(socket.mission_id, JSON.stringify({
            act: 'delete_note',
            arg: note._id
        }));

    } catch (err) {
        socket.send(JSON.stringify({
            act: 'error',
            arg: {
                text: 'Error deleting note.'
            }
        }));
        logger.error(err);
    }
}
// ------------------------------------------------------------------------------------------------------------------- /NOTES


// OPNOTES -------------------------------------------------------------------------------------------------------------------
async function getOpnotes(socket) {
    try {
        var opnotes = await mdb.collection('opnotes').aggregate([
            {
                $match: { mission_id: objectid(socket.mission_id), deleted: { $ne: true }}
            },{
                $sort: { opnote_time: 1 }
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
                    opnote_time: 1,
                    target: 1,
                    tool: 1,
                    action: 1,
                    user_id: 1,
                    username: '$username.username'
                }
            }
        ]).toArray();
        socket.send(JSON.stringify({
            act: 'get_opnotes',
            arg: opnotes
        }))

    } catch (err) {
        socket.send(JSON.stringify({
            act: 'error',
            arg: {
                text: 'Error getting opnotes.'
            }
        }));
        logger.error(err);
    }
}

// insert opnote
async function insertOpnote(socket, opnote) {
    try {
        opnote.user_id = socket.user_id;
        opnote.target = xssFilters.inHTMLData(opnote.target);
        opnote.tool = xssFilters.inHTMLData(opnote.tool);
        opnote.action = xssFilters.inHTMLData(opnote.action);

        var new_values = { mission_id: objectid(socket.mission_id), event_id: null, opnote_time: opnote.opnote_time, target: opnote.target, tool: opnote.tool, action: opnote.action, user_id: objectid(opnote.user_id), deleted: false };

        if (objectid.isValid(opnote.event_id)) {
            new_values.event_id = objectid(opnote.event_id);
        }

        var res = await mdb.collection('opnotes').insertOne(new_values);

        opnote._id = new_values._id;
        opnote.username = socket.username;
        insertLogEvent(socket, { text: 'Created opnote: ' + opnote.action + ' ID: ' + opnote._id + '.' });
        sendToRoom(socket.mission_id, JSON.stringify({act: 'insert_opnote', arg: opnote}));

    } catch (err) {
        socket.send(JSON.stringify({
            act: 'error',
            arg: {
                text: 'Error: inserting opnote.'
            }
        }));
        logger.error(err);
    }
}

async function updateOpnote(socket, opnote) {
    try {
        opnote.target = xssFilters.inHTMLData(opnote.target);
        opnote.tool = xssFilters.inHTMLData(opnote.tool);
        opnote.action = xssFilters.inHTMLData(opnote.action);

        var new_values = { $set: { opnote_time: opnote.opnote_time, event_id: null, target: opnote.target, tool: opnote.tool, action: opnote.action } };

        if (objectid.isValid(opnote.event_id))
            new_values.$set.event_id = objectid(opnote.event_id);

        var res = await mdb.collection('opnotes').updateOne({ _id: objectid(opnote._id) }, new_values);
        if (res.result.ok === 1) {
            opnote.username = socket.username;
            insertLogEvent(socket, { text: 'Modified event: ' + opnote.action + ' ID: ' + opnote._id + '.' });
            sendToRoom(socket.mission_id, JSON.stringify({
                act: 'update_opnote',
                arg: opnote
            }));
        } else {
            throw('updateOpnote error.');
        }

    } catch (err) {
        socket.send(JSON.stringify({
            act: 'error',
            arg: {
                text: 'Error: updating opnote.'
            }
        }));
        logger.error(err);
    }
}

// delete opnote
async function deleteOpnote(socket, opnote) {
    try {
        var res = await mdb.collection('opnotes').updateOne({
            _id: objectid(opnote._id)
        }, {
            $set: {
                deleted: true
            }
        });
        if (res.result.ok === 1) {
            insertLogEvent(socket, { text: 'Deleted opnote ID: ' + opnote._id + '.' });
            sendToRoom(socket.mission_id, JSON.stringify({
                act: 'delete_opnote',
                arg: opnote._id
            }));
        } else {
            throw('deleteOpnote error.');
        }

    } catch (err) {
        socket.send(JSON.stringify({
            act: 'error',
            arg: {
                text: 'Error: deleting opnote.'
            }
        }));
        logger.error(err);
    }
}
// ------------------------------------------------------------------------------------------------------------------- /OPNOTES

// EVENTS -------------------------------------------------------------------------------------------------------------------
// get events
async function getEvents(socket) {
    try {
        var events = await mdb.collection('events').aggregate([{
            $match: {
                mission_id: objectid(socket.mission_id),
                deleted: {
                    $ne: true
                }
            }
        }, {
            $sort: {
                event_time: 1
            }
        }, {
            $lookup: {
                from: 'users',
                localField: 'user_id',
                foreignField: '_id',
                as: 'username'
            }
        }, {
            $project: {
                _id: 1,
                event_time: 1,
                discovery_time: 1,
                event_type: 1,
                source_object: 1,
                dest_object: 1,
                source_port: 1,
                dest_port: 1,
                short_desc: 1,
                username: '$username.username'
            }
        }]).toArray();
        socket.send(JSON.stringify({
            act: 'get_events',
            arg: events
        }))

    } catch (err) {
        socket.send(JSON.stringify({
            act: 'error',
            arg: {
                text: 'Error getting events.'
            }
        }));
        logger.error(err);
    }
}

// insert event
async function insertEvent(socket, event) {
    try {
        event.event_type = xssFilters.inHTMLData(event.event_type);
        event.short_desc = xssFilters.inHTMLData(event.short_desc);
        event.source_port = xssFilters.inHTMLData(event.source_port);
        event.dest_port = xssFilters.inHTMLData(event.dest_port);
        event.user_id = socket.user_id;
        event.username = socket.username;

        var evt = {
            mission_id: objectid(socket.mission_id),
            event_time: event.event_time,
            discovery_time: event.discovery_time,
            source_object: null,
            source_port: event.source_port,
            dest_object: null,
            dest_port: event.dest_port,
            event_type: event.event_type,
            short_desc: event.short_desc,
            user_id: objectid(socket.user_id),
            deleted: false
        };

        if (event.source_object && objectid.isValid(event.source_object)) {
            evt.source_object = objectid(event.source_object);
        }

        if (event.dest_object && objectid.isValid(event.dest_object)) {
            evt.dest_object = objectid(event.dest_object);
        }

        if (event.assignment && objectid.isValid(event.assignment)) {
            evt.assignment = objectid(event.assignment);
        }

        var res = await mdb.collection('events').insertOne(evt);
        event._id = evt._id;
        insertLogEvent(socket, { text: 'Created event: ' + event.event_type + ' ID: ' + event._id + '.' });
        sendToRoom(socket.mission_id, JSON.stringify({
            act: 'insert_event',
            arg: event
        }));

    } catch (err) {
        socket.send(JSON.stringify({
            act: 'error',
            arg: {
                text: 'Error: inserting event.'
            }
        }));
        logger.error(err);
    }
}

// update event
async function updateEvent(socket, event) {
    try {
        event.event_type = xssFilters.inHTMLData(event.event_type);
        event.short_desc = xssFilters.inHTMLData(event.short_desc);
        event.source_port = xssFilters.inHTMLData(event.source_port);
        event.dest_port = xssFilters.inHTMLData(event.dest_port);

        var new_values = {
            $set: {
                event_time: event.event_time,
                discovery_time: event.discovery_time,
                source_object: null,
                source_port: event.source_port,
                dest_object: null,
                dest_port: event.dest_port,
                event_type: event.event_type,
                short_desc: event.short_desc,
                assignment: null
            }
        };

        if (event.source_object && objectid.isValid(event.source_object))
            new_values.$set.source_object = objectid(event.source_object);
        if (event.dest_object && objectid.isValid(event.dest_object))
            new_values.$set.dest_object = objectid(event.dest_object);
        if (event.assignment && objectid.isValid(event.assignment))
            new_values.$set.assignment = objectid(event.assignment);

        var res = await mdb.collection('events').updateOne({
            _id: objectid(event._id)
        }, new_values);
        if (res.result.ok === 1) {
            insertLogEvent(socket, { text: 'Modified event: ' + event.event_type + ' ID: ' + event._id + '.' });
            sendToRoom(socket.mission_id, JSON.stringify({
                act: 'update_event',
                arg: event
            }));
        } else {
            throw('updateEvent error');
        }

    } catch (err) {
        socket.send(JSON.stringify({
            act: 'error',
            arg: {
                text: 'Error: updating event.'
            }
        }));
        logger.error(err);
    }
}

// delete event
async function deleteEvent(socket, event) {
    try {
        var res = await mdb.collection('events').updateOne({
            _id: objectid(event._id)
        }, {
            $set: {
                deleted: true
            }
        });
        if (res.result.ok === 1) {
            insertLogEvent(socket, { text: 'Deleted event ID: ' + event._id + '.' });
            sendToRoom(socket.mission_id, JSON.stringify({
                act: 'delete_event',
                arg: event._id
            }));
        } else {
            throw('deleteEvent error.');
        }

    } catch (err) {
        socket.send(JSON.stringify({
            act: 'error',
            arg: {
                text: 'Error: deleting event.'
            }
        }));
        logger.error(err);
    }
}

// ------------------------------------------------------------------------------------------------------------------- /EVENTS

function missionMessageCheck(socket, permission) {
    if (socket.is_admin) {
        return true;
    }

    if(socket.mission_id && objectid.isValid(socket.mission_id) && socket.user_id && objectid.isValid(socket.user_id)) {
        if (!socket.mission_permissions || !socket.mission_permissions[socket.mission_id] || (permission !== '' && !socket.mission_permissions[socket.mission_id][permission])) {
            return false;
        }
        return true;

    } else {
        logger.error('Message parsing failure.')
        return false;
    }
}

function adminMessageCheck(socket) {
    return socket.is_admin;
}

const messageHandlers = {
    insert_mission: { function: insertMission, checks: function() { return true; }, permission: '' },
    update_mission: { function: updateMission, checks: adminMessageCheck, permission: '' },
    delete_mission: { function: deleteMission, checks: adminMessageCheck },
    get_users: { function: getUsers, checks: adminMessageCheck, permission: '' },
    insert_user: { function: insertUser, checks: adminMessageCheck, permission: '' },
    update_user: { function: updateUser, checks: adminMessageCheck, permission: '' },
    delete_user: { function: deleteUser, checks: adminMessageCheck, permission: '' },
    get_chats: { function: getChats, checks: function() { return true; } },
    get_old_chats: { function:  getOldChats, checks: missionMessageCheck },
    insert_chat: { function:  insertChat, checks: missionMessageCheck, permission: 'write_access' },
    delete_chat: { function:  deleteChat, checks: missionMessageCheck, permission: 'delete_access' },
    get_chat_channels: { function:  getChatChannels, checks: missionMessageCheck, permission: '' },
    insert_chat_channel: { function:  insertChatChannel, checks: missionMessageCheck, permission: 'write_access' },
    get_mission_users: { function:  getMissionUsers, checks: missionMessageCheck, permission: 'manage_users' },
    insert_mission_user: { function:  insertMissionUser, checks: missionMessageCheck, permission: 'manage_users' },
    update_mission_user: { function:  updateMissionUser, checks: missionMessageCheck, permission: 'manage_users' },
    delete_mission_user: { function:  deleteMissionUser, checks: missionMessageCheck, permission: 'manage_users' },
    get_files: { function:  getFiles, checks: missionMessageCheck, permission: '' },
    insert_file: { function:  insertFile, checks: missionMessageCheck, permission: 'write_access' },
    update_file: { function:  moveFile, checks: missionMessageCheck, permission: 'write_access' },
    delete_file: { function:  deleteFile, checks: missionMessageCheck, permission: 'delete_access'},
    get_notes: { function:  getNotes, checks: missionMessageCheck, permission: '' },
    insert_note: { function:  insertNote, checks: missionMessageCheck, permission: 'write_access' },
    update_note: { function:  updateNote, checks: missionMessageCheck, permission: 'write_access' },
    delete_note: { function:  deleteNote, checks: missionMessageCheck, permission: 'delete_access' },
    get_opnotes: { function:  getOpnotes, checks: missionMessageCheck, permission: '' },
    insert_opnote: { function:  insertOpnote, checks: missionMessageCheck, permission: 'write_access' },
    update_opnote: { function:  updateOpnote, checks: missionMessageCheck, permission: 'write_access' },
    delete_opnote: { function:  deleteOpnote, checks: missionMessageCheck, permission: 'delete_access' },
    get_events: { function:  getEvents, checks: missionMessageCheck, permission: '' },
    insert_event: { function:  insertEvent, checks: missionMessageCheck, permission: 'write_access' },
    update_event: { function:  updateEvent, checks: missionMessageCheck, permission: 'write_access' },
    delete_event: { function:  deleteEvent, checks: missionMessageCheck, permission: 'delete_access' }
};

// SOCKET -------------------------------------------------------------------------------------------------------------------
async function setupSocket(socket) {
    if (!socket.loggedin) {
        socket.close();
        return;
    }

    socket.on('pong', function () {
        socket.isAlive = true;
    });

    socket.on('close', function() {
        // cleanup closed sockets from rooms
        if (socket.rooms) {
            for (var i = 0; i < socket.rooms.length; i++) {
                if (rooms.get(socket.rooms[i])) {
                    rooms.get(socket.rooms[i]).delete(socket);

                    if (rooms.get(socket.rooms[i]).size === 0) {
                        rooms.delete(socket.rooms[i]);

                        // user's last socket is gone
                        if (socket.user_id && socket.rooms[i] === socket.user_id) {
                            sendToAllRooms(JSON.stringify({
                                act: 'update_user_status',
                                arg: [{ _id: socket.user_id, status: 'offline' }]
                            }));
                        }
                    }
                }
            }
        }
    })

    socket.on('message', async function (msg, flags) {
        try {
            msg = JSON.parse(msg);
        } catch (e) {
            return;
        }

        if (msg.act && socket.loggedin) {
            switch (msg.act) {
                case 'stream':
                    var stream = new wsjsonstream(socket);
                    socket.type = 'sharedb';
                    backend.listen(stream);
                    break;

                    // join mission room
                case 'join':
                    // trying to join without perms
                    if (!socket.mission_permissions || !socket.mission_permissions[msg.arg.mission_id]) {
                        socket.send(JSON.stringify({
                            act: 'error',
                            arg: 'Denied.'
                        }));
                        socket.close();
                        break;
                    }

                    // grab the diagram and load it into memory if necessary
                    if (!await loadGraph(msg.arg.mission_id)) {
                        socket.send(JSON.stringify({
                            act: 'error',
                            arg: 'Invalid mission id.'
                        }));
                        socket.close();
                        break;
                    }

                    socket.rooms = [ msg.arg.mission_id, socket.user_id ];
                    socket.mission_id = msg.arg.mission_id;
                    socket.type = 'graph';

                    // mission socket room
                    if (!rooms.get(socket.mission_id)) {
                        rooms.set(socket.mission_id, new Set());
                    }

                    // user socket room
                    if (!rooms.get(socket.user_id)) {
                        rooms.set(socket.user_id, new Set());
                        if (socket.type === 'graph') {
                            sendToAllRooms(JSON.stringify({
                                act: 'update_user_status',
                                arg: [{ _id: socket.user_id, status: 'online' }]
                            }));
                        }
                    }

                    // join mission room
                    rooms.get(socket.mission_id).add(socket);

                    // join personal room
                    rooms.get(socket.user_id).add(socket);

                    var resp = {};
                    var limited = true;

                    socket.send(JSON.stringify({
                        act: 'get_graph',
                        arg: builder.buildObject(graphs.get(socket.mission_id))
                    }));

                    if (socket.mission_permissions[socket.mission_id].manage_users) {
                        getUsers(socket, true);
                        getMissionUsers(socket);
                    }

                    getNotes(socket);
                    getFiles(socket);
                    getEvents(socket);
                    getOpnotes(socket);

                    // get mission channels
                    var channels = await getChatChannels(socket);

                    // join mission channels
                    for (var i = 0; i < channels.length; i++) {
                        if (channels[i].type === 'channel') {
                            if (!rooms.get(channels[i]._id.toString())) {
                                rooms.set(channels[i]._id.toString(), new Set());
                            }
                            rooms.get(channels[i]._id.toString()).add(socket);
                        }
                    }

                    getChats(socket, channels);

                    socket.send(JSON.stringify({
                        act: 'join',
                        arg: resp
                    }));

                    break;

                case 'main':
                    // join main room
                    socket.rooms = [ 'main' ];
                    if (!rooms.get('main')) {
                        rooms.set('main', new Set());
                    }
                    rooms.get('main').add(socket);
                    socket.type = 'main';
                    break;

                case 'config':
                    // join config room
                    socket.rooms = [ 'config' ];
                    if (!rooms.get('config')) {
                        rooms.set('config', new Set());
                    }
                    rooms.get('config').add(socket);
                    socket.type = 'config';
                    break;

                case 'get_missions':
                    getMissions(socket);
                    break;

                case 'update_graph':
                    parser.parseString(msg.arg, function(err, result) {
                        if (err) {
                            logger.error(err);
                            return;
                        }

                        var graph = graphs.get(socket.mission_id);

                        if (!graph) {
                            socket.send(JSON.stringify({
                                act: 'error',
                                arg: 'Invalid mission id.'
                            }));
                            return;
                        }

                        var res = '';
                        if (result.mxRootChange) {
                            res = mxRootChange(result, graph);
                        }
                        if (result.mxChildChange) {
                            res = mxChildChange(result, graph);
                        }
                        if (result.mxValueChange) {
                            res = mxValueChange(result, graph);
                        }
                        if (result.mxGeometryChange) {
                            res = mxGeometryChange(result, graph);
                        }
                        if (result.mxTerminalChange) {
                            res = mxTerminalChange(result, graph);
                        }
                        if (result.mxTerminalChange) {
                            res = mxTerminalChange(result, graph);
                        }
                        if (result.mxStyleChange) {
                            res = mxStyleChange(result, graph);
                        }

                        // save changes
                        if (!saveGraph(socket.mission_id, graph)) {
                            socket.send(JSON.stringify({
                                act: 'error',
                                arg: 'Warning, error saving graph.'
                            }));
                        }

                        if (res !== undefined && res  !== '') {
                            // forward change to other clients
                            sendToRoom(socket.mission_id, JSON.stringify({ act: 'update_graph_o', arg: msg.arg }), socket);
                            sendToRoom(socket.mission_id, JSON.stringify({ act: 'update_graph', arg: builder.buildObject(res) }), socket);
                        }
                    });
                    break;

                default:
                    if (messageHandlers[msg.act]) {
                        if (messageHandlers[msg.act].checks(socket, messageHandlers[msg.act].permission) && ajv.validate(validators[msg.act], msg.arg)) {
                            messageHandlers[msg.act].function(socket, msg.arg);
                        } else {
                            socket.send(JSON.stringify({
                                act: 'error',
                                arg: {
                                    text: 'Permission denied or invalid data.'
                                }
                            }));
                            logger.error('' + msg.act + ' failed. Arguments:', msg.arg, 'Validator Errors:', ajv.errors)
                        }
                    }
                    break;
            }
            if (msg.msgId !== undefined) {
                socket.send(JSON.stringify({
                    act: 'ack',
                    arg: msg.msgId
                }));
            }
        }
    });
}

app.get('/', function (req, res) {
    if (req.session.loggedin) {
        res.render('index', {
            title: 'cop',
            is_admin: JSON.stringify(req.session.is_admin)
        });
    } else {
        res.redirect('login');
    }
});

app.get('/logout', function (req, res) {
    req.session.destroy();
    res.redirect('login');
});

app.post('/api/alert', function (req, res) {
    msg = {};
    if (!req.body.mission_id || !objectid.isValid(req.body.mission_id) || !req.body.api || !req.body.channel || !req.body.text) {
        res.end('ERR');
        return;
    }
    msg.user_id = 0;
    msg.analyst = '';
    msg.channel = req.body.channel;
    msg.text = xssFilters.inHTMLData(req.body.text);
    msg.timestamp = (new Date).getTime();
    mdb.collection('users').findOne({
        api: req.body.api,
        deleted: {
            $ne: true
        }
    }, function (err, row) {
        if (row) {
            msg.user_id = row._id;
            msg.username = row.username;

            mdb.collection('missions').aggregate([{
                $match: {
                    _id: objectid(req.body.mission_id),
                    'mission_users.user_id': objectid(msg.user_id),
                    deleted: {
                        $ne: true
                    }
                }
            }, {
                $unwind: '$mission_users'
            }, {
                $match: {
                    'mission_users.user_id': objectid(msg.user_id)
                }
            }, {
                $project: {
                    permissions: '$mission_users.permissions',
                }
            }]).toArray(function (err, row) {
                if (row) {
                    if (row[0].permissions.api_access) {
                        sendToRoom(req.body.mission_id, JSON.stringify({
                            act: 'chat',
                            arg: [msg]
                        }));
                        res.end('OK');
                    }
                } else {
                    if (err)
                        logger.error(err);
                    res.end('ERR');
                }
            });
        } else {
            if (err)
                logger.error(err);
            res.end('ERR');
        }
    });
});

app.post('/api/:table', async function (req, res) {
    if (!req.session.loggedin) {
        res.status(500).send('Error: Permission denied or invalid data.');
        return;
    }
    res.writeHead(200, {
        "Content-Type": "application/json"
    });
    // change password
    if (req.params.table !== undefined && req.params.table === 'change_password') {
        var hash = await bcrypt.hash(req.body.newpass, 10);
        mdb.collection('users').updateOne({
            _id: objectid(req.session.user_id)
        }, {
            $set: {
                password: hash
            }
        }, function (err, result) {
            if (!err) {
                res.end(JSON.stringify('OK'));
            } else {
                res.end(JSON.stringify('Error: Password change error.'));
                logger.error(err);
            }
        });
    } else {
        res.status(500).send('Error: Permission denied or invalid data.');
    }
});

app.get('/config', function (req, res) {
    if (req.session.loggedin) {
        var profile = {};
        profile.username = req.session.username;
        profile.name = req.session.name;
        profile.user_id = req.session.user_id;
        profile.api = req.session.api;
        profile.is_admin = JSON.stringify(req.session.is_admin);
        res.render('config', {
            title: 'cop',
            profile: profile,
            is_admin: JSON.stringify(req.session.is_admin)
        });
    } else {
        res.redirect('login');
    }
});

app.get('/cop', function (req, res) {
    if (req.session.loggedin) {
        if (req.query.mission !== undefined && req.query.mission && objectid.isValid(req.query.mission)) {
            try {
                if (req.session.username === 'admin') {
                    mdb.collection('missions').aggregate([{
                        $match: {
                            _id: objectid(req.query.mission),
                            deleted: {
                                $ne: true
                            }
                        }
                    }]).toArray(function (err, row) {
                        if (row && row.length > 0) {
                            var mission_name = row[0].name;
                            req.session.mission_permissions[req.query.mission] = {
                                manage_users: true,
                                write_access: true,
                                delete_access: true,
                                api_access: true
                            }; //admin has all permissions

                            res.render('cop', {
                                title: 'cop - ' + mission_name,
                                permissions: JSON.stringify(req.session.mission_permissions[req.query.mission]),
                                mission_name: mission_name,
                                user_id: req.session.user_id,
                                username: req.session.username
                            });
                        } else {
                            res.redirect('login');
                            if (err)
                                logger.error(err);
                        }
                    });
                }
                else {
                    mdb.collection('missions').aggregate([{
                        $match: {
                            _id: objectid(req.query.mission),
                            'mission_users.user_id': objectid(req.session.user_id),
                            deleted: {
                                $ne: true
                            }
                        }
                    }, {
                        $unwind: '$mission_users'
                    }, {
                        $match: {
                            'mission_users.user_id': objectid(req.session.user_id)
                        }
                    }, {
                        $project: {
                            name: 1,
                            permissions: '$mission_users.permissions',
                        }
                    }]).toArray(function (err, row) {
                        if (row && row.length > 0) {
                            var mission_name = row[0].name;
                            req.session.mission_permissions[req.query.mission] = row[0].permissions;

                            if (req.session.mission_permissions[req.query.mission]) { // always let admin in
                                res.render('cop', {
                                    title: 'cop - ' + mission_name,
                                    permissions: JSON.stringify(req.session.mission_permissions[req.query.mission]),
                                    mission_name: mission_name,
                                    user_id: req.session.user_id,
                                    username: req.session.username
                                });
                            }
                            else {
                                res.redirect('login');
                            }
                        } else {
                            res.redirect('login');
                            if (err)
                                logger.error(err);
                        }
                    });
                }
            } catch (err) {
                logger.error(err);
                res.redirect('login');
            }
        } else {
            res.redirect('../');
        }
    } else {
        res.redirect('login');
    }
});

app.post('/login', function (req, res) {
    if (req.body.username !== undefined && req.body.username !== '' && req.body.password !== undefined && req.body.password !== '') {
        mdb.collection('users').findOne({
            username: {
                $eq: req.body.username
            }
        }, function (err, row) {
            if (row) {
                bcrypt.compare(req.body.password, row.password, function (err, bres) {
                    if (bres) {
                        req.session.user_id = row._id;
                        req.session.name = row.name;
                        req.session.username = row.username;
                        req.session.loggedin = true;
                        req.session.is_admin = row.is_admin;
                        req.session.api = row.api;
                        req.session.mission_permissions = {};
                        res.redirect('login');
                    } else {
                        res.render('login', {
                            title: 'cop',
                            message: 'Invalid username or password.'
                        });
                    }
                });
            } else {
                if (err) {
                    logger.error(err);
                }
                res.render('login', {
                    title: 'cop',
                    message: 'Invalid username or password.'
                });
            }
        });
    } else {
        res.render('login', {
            title: 'cop',
            message: 'Invalid username or password.'
        });
    }
});


app.get('/login', function (req, res) {
    if (req.session.loggedin) {
        res.redirect('.');
    } else {
        res.render('login', {
            title: 'cop Login'
        });
    }
});


// --------------------------------------- FILES ------------------------------------------
app.use('/download', async function(req, res) {
    try {
        if (req.session.loggedin && (req.session.is_admin || req.session.mission_permissions[req.query.mission_id])) {
            var file = await mdb.collection('missions').aggregate([{
                $match: {
                    _id: objectid(req.query.mission_id),
                    deleted: {
                        $ne: true
                    }
                }
            }, {
                $unwind: '$files'
            }, {
                $match: { 
                    'files._id': objectid(req.query.file_id),
                    'files.deleted': {
                        $ne: true
                    }
                }
            }, {
                $project: {
                    _id: '$files._id',
                    parent_id: '$files.parent_id',
                    name: '$files.name',
                    realName: '$files.realName',
                    type: '$files.type'
                }
            }]).toArray();
            if (file.length === 1) {
                var base = path.join(__dirname, '/mission_files');
                res.download(base + '/' + file[0].realName, file[0].name);
            }
        } else {
            throw('app.use /download Not signed in.')
        }
    } catch (err) {
        res.status(500).send('Error: Permission denied or invalid data.');
        logger.error(err);
    }
});

app.use('/render', express.static('mission_files'));

function findUserSocket(user_id, mission_id) {
    for (var i = rooms.get(mission_id).values(), socket = null; socket = i.next().value; ) {
        if (socket.readyState === socket.OPEN && socket.mission_id === mission_id && socket.user_id === user_id) {
            return socket;
        }
    };
    return null;
}

app.post('/upload', upload.any(), function (req, res) {
    try {
        if (!req.session.loggedin || !req.session.mission_permissions[req.body.mission_id].write_access) {
            throw('app.post /upload Not signed in.');
        }
        if ((req.body.channel_id ? !req.body.parent_id : req.body.parent_id) && req.body.mission_id) {
            //var wwwdir = path.join('/mission-' + req.body.mission_id + '/');
            var base = path.join(__dirname, '/mission_files');

            var s = findUserSocket(req.session.user_id, req.body.mission_id);
            if (!s) {
                throw('app.post /upload Can\'t find user\'s socket.');
            }

            // making sure base directory exists
            try {
                var dirstat = fs.statSync(base);
            } catch (err) {
                if (err.code == 'ENOENT') {
                    fs.mkdirSync(base, { recursive: true });
                    dirstat = fs.statSync(base);
                } else {
                    throw (err);
                }
            }

            async.each(req.files, function (file, callback) {
                var newFile = {};

                // check if we already have this file saved, if not don't save another copy
                fs.createReadStream(file.path).pipe(crypto.createHash('sha1').setEncoding('hex')).on('finish', async function() {
                    var hash = this.read();
                    try {
                        fs.statSync(base + '/' + hash);
                    } catch (err) {
                        if (err.code == 'ENOENT') {
                            fs.renameSync(file.path, base + '/' + hash)
                        }
                    }

                    newFile.name = file.originalname;
                    newFile.realName = hash;
                    newFile.type = 'file';
                    newFile.hash = hash;

                    // file upload
                    if (req.body.parent_id) {
                        newFile.parent_id = req.body.parent_id;
                        insertFile(s, newFile);                        
                    }
                    // chat upload
                    else if (req.body.channel_id) {
                        var res = await mdb.collection('missions').findOne({
                            _id: objectid(req.body.mission_id),
                            deleted: {
                                $ne: true
                            }
                        }, {
                            projection: { chat_files_root: 1 }
                        });
                        newFile.name = file.originalname;
                        newFile.parent_id = res.chat_files_root;

                        new_id = await insertFile(s, newFile, true);

                        var buffer = readChunk.sync(base + '/' + hash, 0, fileType.minimumBytes);
                        var filetype = fileType(buffer);

                        if (filetype === undefined) {
                            var mimetype = mime.lookup(file.originalname);
                            var extension = mime.extension(mimetype);
                            if (!mimetype) {
                                mimetype = 'unknown file type';
                                extension = 'unk';
                            }
                            insertLogEvent(s, { text: '<a href="/download?file_id=' + new_id + '&mission_id=' + req.body.mission_id + '"><div class="chatFile"><img class="chatIcon" src="/images/file_types/' + extension + '.svg"><div class="chatFileDescription"><div class="chatFileName">' + file.originalname + '</div><div class="chatFileSize">' + mimetype + ' (' + readableBytes(file.size) + ')</div></div></div></a>', channel_id: req.body.channel_id, type: req.body.type }, false);
                        }
                        else if (filetype.mime === 'image/png' || filetype.mime === 'image/jpg' || filetype.mime === 'image/gif') {
                            insertLogEvent(s, { text: '<img class="chatImage" src="/render/' + hash + '">', channel_id: req.body.channel_id, type: req.body.type }, false);
                        } else {
                            insertLogEvent(s, { text: '<a href="/download?file_id=' + new_id + '&mission_id=' + req.body.mission_id + '"><div class="chatFile"><img class="chatIcon" src="/images/file_types/' + filetype.ext + '.svg"><div class="chatFileDescription"><div class="chatFileName">' + file.originalname + '</div><div class="chatFileSize">' + filetype.mime + ' (' + readableBytes(file.size) + ')</div></div></div></a>', channel_id: req.body.channel_id, type: req.body.type}, false);
                        }
                    }
                    
                });
                callback(file);
            }, function (file) {
                res.send('{}');
            });
        }
    } catch (err) {
        logger.error(err);
        res.status(500).send('Error: Permission denied or invalid data.');
    }
});

app.post('/avatar', upload.any(), function (req, res) {
    if (!req.session.loggedin || (!req.session.is_admin && req.session.user_id !== req.body.id)) {
        res.status(500).send('Error: Permission denied or invalid data.');
        return;
    }
    if (req.body.id) {
        var dir = path.join(__dirname + '/public/images/avatars/');
        async.each(req.files, function (file, callback) {
            fs.rename(file.path, dir + '/' + req.body.id + '.png', function (err) {
                if (err) {
                    res.status(500).send('Error: File upload error.');
                    logger.error(err);
                } else {
                    callback();
                }
            });
        }, function () {
            mdb.collection('users').updateOne({
                _id: objectid(req.body.id)
            }, {
                $set: {
                    avatar: req.body.id + '.png'
                }
            }, function (err, result) {
                if (!err) {
                    res.end(JSON.stringify('OK'));
                } else {
                    logger.error(err);
                    res.end(JSON.stringify('ERR21'));
                }
            });
        });
    } else {
        res.status(500).send('Error: Permission denied or invalid data.');
    }
});

app.get("/images/avatars/*", function (req, res, next) {
    res.sendFile(path.join(__dirname, 'public/images/avatars/default.png'));
});

app.get("/images/file_types/*", function (req, res, next) {
    res.sendFile(path.join(__dirname, 'public/images/file_types/blank.svg'));
});

// -------------------------------------------------------------------------

http.listen(3000, function () {
    logger.info('Server listening on port 3000!');
});