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
const users = new Map();
const rooms = new Map();
const graphs = new Map();
const presence = {};
const timers = {};
const upload = multer({
    dest: './temp_uploads'
});
const wsjsonstream = require('websocket-json-stream');
const xssFilters = require('xss-filters');
const wss = require('ws');
const ws = new wss.Server({
    server: http
});

// add presence support to rich-text
richText.type.transformPresence = function(presence, op, isOwnOp) {
    if (!presence) {
      return null;
    }
  
    var start = presence.index;
    var end = presence.index + presence.length;
    var delta = new richText.Delta(op);
    start = delta.transformPosition(start, !isOwnOp);
    end = delta.transformPosition(end, !isOwnOp);
  
    return Object.assign({}, presence, {
      index: start,
      length: end - start
    });
};

// hooking _subscribe to catch subscriptions to notes
ShareDB.Agent.prototype._osubscribe = ShareDB.Agent.prototype._subscribe;
ShareDB.Agent.prototype._subscribe = function(collection, id, version, callback) {
    try {
        if (this.mission_id && this.user_id) {
            // create doc map if it doesn't exist
            if (!presence[this.mission_id]) {
                presence[this.mission_id] = {};
            }

            // add document subscription and user to the map
            if (!presence[this.mission_id][id]) {
                presence[this.mission_id][id] = {};
            }

            // add or incerement the susbcription belonging to the user
            if (!presence[this.mission_id][id][this.user_id]) {
                presence[this.mission_id][id][this.user_id] = { count: 1, username: this.username };
                
                // send presence
                sendToRoom(this.mission_id, JSON.stringify({
                    act: 'insert_presence',
                    arg: { doc: id, user_id: this.user_id, presence: presence[this.mission_id][id][this.user_id] }
                }));
            } else {
                presence[this.mission_id][id][this.user_id].count++;
            }
        }
    } catch (err) {
        logger.error(err);
    }
    this._osubscribe(collection, id, version, callback);
};

ShareDB.Agent.prototype._ounsubscribe = ShareDB.Agent.prototype._unsubscribe;
ShareDB.Agent.prototype._unsubscribe = function(collection, id, callback) {
    try {
        if (this.mission_id && this.user_id) {
            var docs = presence[this.mission_id];

            // decrement disconnected user from open docs
            if (--docs[id][this.user_id].count == 0) {
                delete docs[id][this.user_id];

                // send presence
                sendToRoom(this.mission_id, JSON.stringify({
                    act: 'delete_presence',
                    arg: { doc: id, user_id: this.user_id }
                }));
            }

            // remove empty doc id
            if (Object.keys(docs[id]).length == 0) {
                delete docs[id];
            }
        }
    } catch (err) {
        logger.error(err);
    }
    this._ounsubscribe(collection, id, callback);
}

// hooking _cleanup so we can catch disconnecting sharedb connections
ShareDB.Agent.prototype._ocleanup = ShareDB.Agent.prototype._cleanup;
ShareDB.Agent.prototype._cleanup = function() {
    if (this.closed) return;
    try {
        if (this.mission_id && this.user_id && this.subscribedDocs && this.subscribedDocs.sharedb) {
            var keys = Object.keys(this.subscribedDocs.sharedb);
            var docs = presence[this.mission_id];

            for (var i = 0; i < keys.length; i++) {
                // decrement disconnected user from open docs
                if (--docs[keys[i]][this.user_id].count == 0) {
                    delete docs[keys[i]][this.user_id];

                    // send presence
                    sendToRoom(this.mission_id, JSON.stringify({
                        act: 'delete_presence',
                        arg: { doc: keys[i], user_id: this.user_id }
                    }));
                }

                // remove empty doc id
                if (Object.keys(docs[keys[i]]).length == 0) {
                    delete docs[keys[i]];
                }
            }
        }
    } catch (err) {
        logger.error(err);
    }
    this._ocleanup();
};

sharedbmongo.prototype._owriteSnapshot = sharedbmongo.prototype._writeSnapshot;
sharedbmongo.prototype._writeSnapshot = function(collectionName, id, snapshot, opLink, callback) {
    this._owriteSnapshot(collectionName, id, snapshot, opLink, callback);
}

app.set('view engine', 'pug');
app.set('view options', { doctype: 'html' })
app.use(express.static('public'));
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({
    extended: true
}));

app.use(pino);
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
            wtimeout: 5000
        },
        host: 'localhost',
        collection: 'sessions',
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
var backend = null;
var mdb;
const mongoclient = mongodb.connect('mongodb://localhost/cop', {
    useNewUrlParser: true,
    useUnifiedTopology: true,
    wtimeout: 5000
}, (err, client) => {
    if (err) {
        throw err;
    }

    client.on('close', function () {
        logger.error('Connection to database closed. Error?');
        ws.clients.forEach(function each(socket) {
            socket.close();
        });
    });
    mdb = client.db();

    const sdb = new sharedbmongo({
        mongo: (cb) => { cb(null, client); }
    });

    // start sharedb
    ShareDB.types.register(richText.type);
    backend = new ShareDB({
        db: sdb,
        disableDocAction: true,
        disableSpaceDelimitedActions: true,
        presence: true
    });

    // store the current mission_id in the agent
    backend.use('connect', function (r, c) {
        r.agent.mission_id = r.req.mission_id;
        r.agent.user_id = r.req.user_id;
        r.agent.username = r.req.username;
        c();
    });

    // store the mission_id in the db with the documents
    backend.use('commit', async function (r, c) {
        if (r.op && r.id && r.agent.mission_id && r.snapshot.data && objectid.isValid(r.agent.mission_id)) {
            r.snapshot.data.mission_id = objectid(r.agent.mission_id);
            if (r.op.op) {
                // set a 5s timeout to update clients about the modification
                if (timers[r.id]) {
                    clearTimeout(timers[r.id]);
                }
                var mission_id = r.agent.mission_id;
                var id = r.id;
                var ts = r.op.m.ts;            
                timers[r.id] = setTimeout(function() { updateNoteMtime(mission_id, id, ts) }, 5000);
            }
        }
        c();
    });
});

function updateNoteMtime(mission_id, id, ts) {
    updateNote({ mission_id: mission_id }, { _id: id, mtime: ts });
}

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

// send a message to all mission rooms
function sendToAllRooms(msg) {
    rooms.forEach((room) => {
        if (room.type === 'graph') {
            room.sockets.forEach((socket) => {
                if (socket && socket.readyState === socket.OPEN && socket.type === 'graph') {
                    socket.send(msg);
                }
            });
        }
    });
}

// send a message to all sockets in a room
function sendToRoom(room, msg, selfSocket, permRequired) {
    try {
        if (!selfSocket) {
            selfSocket = null;
        }

        if (!permRequired) {
            permRequired = null;
        }

        if (rooms.get(room)) {
            rooms.get(room).sockets.forEach((socket) => {
                if (socket && socket.readyState === socket.OPEN) {
                    if (socket !== selfSocket) { // TODO: FIX && (!permRequired || socket.cop_permissions[permRequired])) {
                        socket.send(msg);
                    }
                }
            });
        }
    } catch (err) {
        logger.error(err);
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
                        if (req.url === '/mcscop/') {
                            setupGraphSocket(socket);
                        } else if (req.url === '/sharedb/') {
                            setupShareDBSocket(socket);
                        }
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
        try {
            if (socket.isAlive === false)
                return socket.terminate();
            socket.isAlive = false;
            socket.ping(function () {});
        } catch (err) {
            logger.error(err);
        }
    });
}, 30000);

// MXGRAPH -------------------------------------------------------------------------------------------------------------------

async function loadGraph(mission_id) {
    try {
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

        graphs.set(mission_id, mission.graph);

        return true;
    } catch (err) {
        logger.error(err);
        return false;
    }
}

async function saveGraph(mission_id, graph) {
    try {
        var new_values = {};

        new_values.graph = graph;

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

function mxTerminalChange(change, graph) {
    for (var i = 0; i < graph.mxGraphModel.root.mxCell.length; i++) {
        if (graph.mxGraphModel.root.mxCell[i].id == change.cell) {
            if (change.source == 1) {
                if (change.terminal) {
                    graph.mxGraphModel.root.mxCell[i].source = change.terminal;
                } else {
                    delete graph.mxGraphModel.root.mxCell[i].source;
                }
            } else {
                if (change.terminal) {
                    graph.mxGraphModel.root.mxCell[i].target = change.terminal;
                } else {
                    delete graph.mxGraphModel.root.mxCell[i].target;
                }
            }
            return change;
        }
    }
    return undefined;
}

function mxGeometryChange(change, graph) {
    for (var i = 0; i < graph.mxGraphModel.root.mxCell.length; i++) {
        if (graph.mxGraphModel.root.mxCell[i].id === change.cell) {
            graph.mxGraphModel.root.mxCell[i].mxGeometry = change.mxGeometry;
            return change;
        }
    }
    return undefined;
}

function mxValueChange(change, graph, socket) {
    change.value = xssFilters.inHTMLData(change.value);
    for (var i = 0; i < graph.mxGraphModel.root.mxCell.length; i++) {
        if (graph.mxGraphModel.root.mxCell[i].id === change.cell) {
            // make sure cell is editable
            if (graph.mxGraphModel.root.mxCell[i].style.indexOf('editable=0;') === -1) {
                graph.mxGraphModel.root.mxCell[i].value = change.value;

                updateNote(socket, { _id: change.cell, name: change.value.split('\n')[0].substring(0,16) });

                return change;
            } else {
                return undefined;
            }
        }
    }
    return undefined;
}

function mxStyleChange(change, graph) {
    for (var i = 0; i < graph.mxGraphModel.root.mxCell.length; i++) {
        if (graph.mxGraphModel.root.mxCell[i].id === change.cell) {
            graph.mxGraphModel.root.mxCell[i].style = change.style;
            return change;
        }
    }
    return undefined;
}

function mxRootChange(change, graph) {
    graph.mxGraphModel.root.mxCell = change.mxCell;
    return undefined;
}

function mxChildChange(change, graph, socket) {
    // delete
    if (change.parent === undefined) {
        for (var i = 0; i < graph.mxGraphModel.root.mxCell.length; i++) {
            if (graph.mxGraphModel.root.mxCell[i].id === change.child) {
                graph.mxGraphModel.root.mxCell.splice(i, 1);

                deleteNote(socket, { _id: change.child });
                return change;
            }
        }
    // move
    } else if (change.index !== undefined && change.child !== undefined) {
        for (var i = 0; i < graph.mxGraphModel.root.mxCell.length; i++) {
            if (graph.mxGraphModel.root.mxCell[i].id === change.child) {
                graph.mxGraphModel.root.mxCell.move(i, change.index);
                return change;
            }
        }
    // insert
    } else if (change.mxCell) {
        graph.mxGraphModel.root.mxCell.push(change.mxCell);
        insertNote(socket, { _id: change.mxCell.id, name: change.mxCell.id });
        return change;
    }
}
// ------------------------------------------------------------------------------------------------------------------- MXGRAPH

// PRESENCE -------------------------------------------------------------------------------------------------------------------
async function getPresence(p) {
    if (presence[p.mission_id]) {
        return presence[p.mission_id];
    } else {
        return {};
    }
}

// -------------------------------------------------------------------------------------------------------------------- PRESENCE

// USERS -------------------------------------------------------------------------------------------------------------------
// get user listing
async function getUsers(p, limited) {
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

        return await mdb.collection('users').find({
            deleted: {
                $ne: true
            }
        }, {
            projection: projection
        }).toArray();

    } catch (err) {
        logger.error(err);
        throw('Error getting users.');
    }
}

// insert new user
async function insertUser(p, user) {
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
        return false;

    } catch (err) {
        logger.error(err);
        throw('Error inserting user.');
    }
}

// update user
async function updateUser(p, user) {
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
                p.send(JSON.stringify({
                    act: 'msg',
                    arg: {
                        title: 'Password Changed!',
                        text: 'Password changed successfully!'
                    }
                }));
            }
        } else {
            throw('updateUser error.');
        }
        return false;

    } catch (err) {
        logger.error(err);
        throw('Error updating user.');
    }
}

// delete user
async function deleteUser(p, user) {
    try {
        var res = await mdb.collection('users').updateOne({
            _id: objectid(user._id)
        }, {
            $set: {
                deleted: true
            }
        });

        if (res.result.ok === 1) {
            // delete user sessions
            res = await mdb.collection('sessions').deleteMany({
                session: { $regex: '.*"user_id":"' + user._id + '".*' }
            });

            // close user sockets
            ws.clients.forEach(function each(socket) {
                if (socket.user_id === user._id) {
                    socket.close();
                }
            });

            // inform other users of the death
            sendToRoom('config', JSON.stringify({
                act: 'delete_user',
                arg: user._id
            }));
        } else {
            throw('deleteUser error.');
        }
        return false;

    } catch (err) {
        logger.error(err);
        throw('Error deleting user.');
    }
}

async function updateUserStatus(p, status) {
    try {
        if (!users.get(p.user_id)) {
            throw('updateUserStatus error, user does not exist.');
        }
        users.get(p.user_id).status = status.status;

        sendToAllRooms(JSON.stringify({
            act: 'update_user_status',
            arg: [{ _id: p.user_id, status: status.status }]
        }));

    } catch (err) {
        logger.error(err);
        throw('Error updating user status.');
    }
}

// -------------------------------------------------------------------------------------------------------------------/USERS

// MISSIONS -------------------------------------------------------------------------------------------------------------------
// get all missions (based on perms)
async function getMissions(p) {
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
        return missions;

    } catch (err) {
        logger.error(err);
        throw('Error getting missions.');
    }
}

// insert mission
async function insertMission(p, mission) {
    try {
        mission.name = xssFilters.inHTMLData(mission.name);

        var filesRoot = objectid(null);
        var chatFilesRoot = objectid(null);
        var graphFilesRoot = objectid(null);

        var newMission = {
            //graph: JSON.stringify(emptyGraph),
            graph: { mxGraphModel: { root: { mxCell: [] } } },
            name: mission.name,
            user_id: objectid(p.user_id),
            mission_users: [],
            files_root: filesRoot,
            graph_files_root: graphFilesRoot,
            chat_files_root: chatFilesRoot,
            files: [
                { _id: filesRoot, name: '/', parent_id: '#', type: 'dir', level: 0, protected: true },
                { _id: chatFilesRoot, name: 'chat_files', parent_id: filesRoot, type: 'dir', level: 1, protected: true },
                { _id: graphFilesRoot, name: 'graph_files', parent_id: filesRoot, type: 'dir', level: 1, protected: true }
            ],
            deleted: false
        };

        newMission.mission_users[0] = {
            _id: objectid(null),
            user_id: objectid(p.user_id),
            permissions: {
                manage_users: true,
                write_access: true,
                delete_access: true,
                api_access: true
            }
        };
        
        var res = await mdb.collection('missions').insertOne(newMission);
        res.ops[0].username = p.username;

        // create default chat channels
        var channels = [{ _id: objectid(null), mission_id: objectid(res.ops[0]._id), name: 'general', deleted: false, type: 'channel', members: [objectid(p.user_id)] }];
        await mdb.collection('channels').insertMany(channels);

        sendToRoom('main', JSON.stringify({
            act: 'insert_mission',
            arg: res.ops[0]
        }));

    } catch (err) {
        logger.error(err);
        throw('Error inserting mission.');
    }
}

// update mission
async function updateMission(p, mission) {
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
        throw('Error updating mission.');
    }
}

// delete mission
async function deleteMission(p, mission) {
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
        throw('Error deleting mission.');
    }
}
// ------------------------------------------------------------------------------------------------------------------- /MISSIONS

// CHATS -------------------------------------------------------------------------------------------------------------------
// get chats
async function getChatChannels(mission_id, user_id) {
    try {
        var channels = await mdb.collection('channels').find({
            mission_id: objectid(mission_id),
            members: { $in: [ objectid(user_id) ]},
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

        var tusers = await mdb.collection('users').find({
            deleted: {
                $ne: true
            }
        }, {
            projection: projection
        }).toArray();
        // user status
        for (var i = 0; i < tusers.length; i++) {
            if (users.get(tusers[i]._id.toString())) {
                tusers[i].status = users.get(tusers[i]._id.toString()).status;
            } else {
                tusers[i].status = 'offline;'
            }
            channels.push({ _id: tusers[i]._id, name: tusers[i].username, type: 'user', status: tusers[i].status });
        }

        return channels;

    } catch (err) {
        logger.error(err);
        throw('Error getting chat channels.');
    }
}

// add new chat channel
async function insertChatChannel(p, channel) {
    try {
        // check if channel already exists
        var count = await mdb.collection('channels').count({
            mission_id: objectid(p.mission_id),
            'name': channel.name
        });

        // don't add existing channel
        if (count === 0) {
            var new_values = {
                _id: objectid(null),
                mission_id: objectid(p.mission_id),
                name: channel.name,
                deleted: false,
                members: [],
                type: 'channel'
            };

            var tusers = await mdb.collection('missions').aggregate([{
                $match: {
                    _id: objectid(p.mission_id),
                    deleted: {
                        $ne: true
                    }
                }
            }, {
                $unwind: '$mission_users'
            }, {
                $project: {
                    _id: '$mission_users.user_id',
                }
            }]).toArray();

            for (var i = 0; i < tusers.length; i ++) {
                new_values.members.push(tusers[i]._id);
            }

            var res = await mdb.collection('channels').insertOne(new_values);

            delete new_values.deleted;
            delete new_values.members;

            // create a room for the new channel
            if (!rooms.get(new_values._id.toString())) {
                rooms.set(new_values._id.toString(), { type: 'channel', sockets: new Set() });
            }
            var room = rooms.get(new_values._id.toString()).sockets;

            // join everyone in the mission to it
            if (rooms.get(p.mission_id)) {
                var missionRoom = rooms.get(p.mission_id).sockets;
                missionRoom.forEach((p) => {
                    room.add(p);
                });
            }

            return [new_valeues];

        } else {
            throw('insertChatChannel channel already exists.')
        }
    } catch (err) {
        logger.error(err);
        throw('Error inserting channel.');
    }
}

// get 50 most recent messages for chat
async function getChats(p, channels) {
    try {
        var chats = [];

        for (var i = 0; i < channels.length; i++) {
            var match = {};
            if (channels[i].type === 'user') {
                match = {
                    $or: [
                        {
                            $and: [{ channel_id: objectid(p.user_id) }, { user_id: objectid(channels[i]._id) }]
                        },
                        {
                            $and: [{ channel_id: objectid(channels[i]._id) }, { user_id: objectid(p.user_id) }]
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
                    editable: 1,
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
        return chats;

    } catch (err) {
        logger.error(err);
        throw('Error getting chats.');
    }
}

// insert chat
async function insertChat(p, chat, filter) {
    if (filter === undefined) {
        filter = true;
    }
    
    try {
        chat.username = p.username;
        chat.user_id = p.user_id;
        if (filter) {
            chat.text = xssFilters.inHTMLData(chat.text);
            chat.editable = true;
        } else {
            chat.editable = false;
        }
        chat.timestamp = (new Date).getTime();

        var count = await mdb.collection('channels').count({
            _id: objectid(chat.channel_id)
        });

        if (count !== 1) {
            throw('insertChat invalid channel.');
        }

        var chat_row = {
            _id: objectid(null),
            user_id: objectid(p.user_id),
            channel_id: objectid(chat.channel_id),
            text: chat.text,
            timestamp: chat.timestamp,
            editable: chat.editable,
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
            chat.channel_id = p.user_id;
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
        return false;
    } catch (err) {
        logger.error(err);
        throw('Error inserting chat.');
    }
}

async function updateChat(p, chat, filter) {
    if (filter === undefined) {
        filter = true;
    }

    chat.username = p.username;
    chat.user_id = p.user_id;

    if (filter) {
        chat.text = xssFilters.inHTMLData(chat.text);
    }

    try {
        var tchat = await mdb.collection('chats').findOne({
            _id: objectid(chat._id),
            user_id: objectid(p.user_id),
            editable: true
        });


        if (!tchat) {
            throw ('updateChat chat does not exist or does not belong to user.');
        }

        var res = await mdb.collection('chats').updateOne({
            _id: objectid(chat._id)
        }, {
            $set: {
                text: chat.text
            }
        });

        chat.channel_id = tchat.channel_id.toString();

        sendToRoom(chat.channel_id, JSON.stringify({
            act: 'update_chat',
            arg: chat
        }));
        return false;
    } catch (err) {
        logger.error(err);
        throw('Error inserting chat.');
    }
}

// delete chat
async function deleteChat(p, chat) {
    try {
        var tchat = await mdb.collection('chats').findOne({
            _id: objectid(chat._id),
            user_id: objectid(p.user_id),
            deleted: {
                $ne: true
            }
        });

        if (!tchat) {
            throw ('deleteChat chat does not exist.');
        }

        if (!p.is_admin && p.user_id != tchat.user_id) {
            throw('deleteChat permission denied.');
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
            return false;
        } else {
            throw('delete_chat error.')
        }

    } catch (err) {
        logger.error(err);
        throw('Error deleting chat.');
    }
}

// get old chats
async function getOldChats(p, request) {
    try {
        var rows = await mdb.collection('chats').aggregate([{
            $match: {
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
            return rows;

        } else {
            return [];
        }
    } catch (err) {
        logger.error(err);
        throw('Error getting old chats.');
    }
}
// ------------------------------------------------------------------------------------------------------------------- /CHATS

// mission_user -------------------------------------------------------------------------------------------------------------------
// get mission users
async function getMissionUsers(p) {
    try {
        return await mdb.collection('missions').aggregate([{
            $match: {
                _id: objectid(p.mission_id),
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

    } catch (err) {
        logger.error(err);
        throw('Error getting mission users.');
    }
}

// add user to a mission
async function insertMissionUser(p, user) {
    try {
        var count = await mdb.collection('missions').count({
            _id: objectid(p.mission_id),
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
                _id: objectid(p.mission_id)
            }, {
                $push: {
                    mission_users: new_values
                }
            });

            var res2 = await mdb.collection('channels').updateMany({
                mission_id: objectid(p.mission_id),
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
                var u = await mdb.collection('users').findOne({
                    _id: objectid(user.user_id),
                    deleted: {
                        $ne: true
                    }
                });
                new_values.username = u.username;
                sendToRoom(p.mission_id, JSON.stringify({
                    act: 'insert_mission_user',
                    arg: new_values
                }));

            } else {
                throw('insertMissionUser error.')
            }

        } else {
            throw('insertMissionUser duplicate user error.')
        }
    } catch (err) {
        logger.error(err);
        throw('Error inserting user in mission.');
    }
}

// update user in mission
async function updateMissionUser(p, user) {
    try {
        var new_values = {
            'mission_users.$.user_id': objectid(user.user_id),
            'mission_users.$.permissions': user.permissions
        };
        var res = await mdb.collection('missions').updateOne({
            _id: objectid(p.mission_id),
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
            sendToRoom(p.mission_id, JSON.stringify({
                act: 'update_mission_user',
                arg: user
            }));

        } else {
            throw('updateMissionUser error.')
        }

    } catch (err) {
        logger.error(err);
        throw('Error updating mission user.');
    }
}

// delete user from mission
async function deleteMissionUser(p, user) {
    try {
        var res = await mdb.collection('missions').findOneAndUpdate({
            _id: objectid(p.mission_id)
        }, {
            $pull: {
                mission_users: {
                    _id: objectid(user._id)
                }
            }
        });
        if (res.ok === 1) {
            sendToRoom(p.mission_id, JSON.stringify({
                act: 'delete_mission_user',
                arg: user._id
            }));
        } else {
            throw('deleteMissionUser error.')
        }

    } catch (err) {
        logger.error(err);
        throw('Error deleting user from mission.');
    }
}
// ------------------------------------------------------------------------------------------------------------------- /mission_user

// FILES -------------------------------------------------------------------------------------------------------------------

// get files
async function getFiles(p) {
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

        return await mdb.collection('missions').aggregate([{
            $match: {
                _id: objectid(p.mission_id),
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

    } catch (err) {
        logger.error(err);
        throw('Error getting files.');
    }
}

async function insertFile(p, file, allowDupName) {
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
                _id: objectid(p.mission_id),
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
                _id: objectid(p.mission_id),
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
                _id: objectid(p.mission_id)
            }, {
                $push: {
                    files: new_value
                }
            });

            if (res.result.ok === 1) {
                return new_value;
            } else {
                throw('insertFile error.')
            }
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
                _id: objectid(p.mission_id),
                'files._id': objectid(file._id)
            }, {
                $set: new_values
            });

            if (res.result.ok === 1) {
                return file;
            } else {
                throw('insertFile error.')
            }

        } else {
            throw('insertFile error.')
        }

    } catch (err) {
        logger.error(err);
        throw('Error creating directory.')
    }
}

async function moveFile(p, file) {
    file.name = xssFilters.inHTMLData(file.name).replace(/\//g,'').replace(/\\/g,'');
    try {
        // get parent level
        var parent = await mdb.collection('missions').aggregate([{
            $match: {
                _id: objectid(p.mission_id),
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
            _id: objectid(p.mission_id),
            files: { $elemMatch: { _id: objectid(file._id), protected: false } }
        }, {
            $set: new_values
        });

        if (res.result.nModified === 1) {
            sendToRoom(p.mission_id, JSON.stringify({
                act: 'update_file',
                arg: file
            }));

        } else {
            throw('moveFile error.')
        }

    } catch (err) {
        logger.error(err);
        throw('Error updating file.')
    }
}

async function deleteFile(p, file) {
    try {
        var res = await mdb.collection('missions').updateMany({
            _id: objectid(p.mission_id)
        }, {
            $pull: {
                files: {
                    $or: [{ _id: objectid(file._id) }, { parent_id: objectid(file._id) }]
                }
            }
        });

        if (res.result.ok === 1) {
            sendToRoom(p.mission_id, JSON.stringify({
                act: 'delete_file',
                arg: file._id
            }));

        } else {
            throw('deleteFile error.')
        }
    } catch (err) {
        logger.error(err);
        throw('Error deleting file.');
    }

}

// ------------------------------------------------------------------------------------------------------------------- /FILES

// NOTES -------------------------------------------------------------------------------------------------------------------
// get notes list
async function getNotes(p) {
    try {
        /*
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
*/

        var notes = await mdb.collection('notes').aggregate([
            {
                $match: { mission_id: objectid(p.mission_id), deleted: { $ne: true }}
            }, {
                $project: {
                    _id: { "$toString": "$_id" },
                    name: 1,
                    type: 1,
                    mtime: 1
                }
            /*}, {
                $lookup: {
                    from: 'sharedb',
                    localField: '_id',
                    foreignField: '_id',
                    as: 'sharenote'
                }
            }, {
            }, {
                $project: {
                    _id: 1,
                    _oid: { $toObjectId: "$_id" },
                    _m: 1,
                    _ops: { $arrayElemAt: [ "$ops", 0 ] },
                },
            }, {
                $project: {
                    _id: 1,
                    _m: 1,
                    _oid: 1,
                    size: { $strLenBytes: { $ifNull: [ "$_ops.insert", "" ] } }
                },
            }, {
                $lookup: {
                    from: 'notes',
                    localField: '_oid',
                    foreignField: '_id',
                    as: 'note'
                }
            
                $project: {
                    _id: 1,
                    name: 1,
                    _m: { $arrayElemAt: ['$sharenote._m', 0] }
                }*/
            }
        ]).toArray();

        for (var i = 0; i < notes.length; i++) {
            notes[i].type = 'note';
        }

        return notes;

    } catch (err) {
        logger.error(err);
        throw('Error getting notes.');
    }
}

async function insertNote(p, note) {
    note.name = xssFilters.inHTMLData(note.name);

    var note_row = {
        _id: objectid(),
        mission_id: objectid(p.mission_id),
        name: note.name,
        deleted: false
    };

    if (note._id) {
        note_row._id = objectid(note._id);
    } 

    try {
        var res = await mdb.collection('notes').insertOne(note_row);

        sendToRoom(p.mission_id, JSON.stringify({
            act: 'insert_note',
            arg: {
                _id: note_row._id,
                name: note.name,
                type: 'note'
            }
        }));

    } catch (err) {
        logger.error(err);
        throw('Error inserting note.');
    }
}

async function updateNote(p, note) {
    var new_values = { $set: { } };
    if (note.name !== undefined) {
        note.name = xssFilters.inHTMLData(note.name);
        new_values.$set.name = note.name;
    }

    if (note.mtime !== undefined) {
        new_values.$set.mtime = note.mtime;
    }

    try {
        var res = await mdb.collection('notes').updateOne({
            _id: objectid(note._id)
        }, new_values);

        new_values.$set._id = note._id;
        if (res.result.nModified > 0) {
            sendToRoom(p.mission_id, JSON.stringify({
                act: 'update_note',
                arg: new_values.$set
            }));
        }

    } catch (err) {
        logger.error(err);
        throw('Error renaming note.');
    }
}

async function deleteNote(p, note) {
    try {
        var res = mdb.collection('notes').updateOne({
            _id: objectid(note._id)
        }, {
            $set: {
                deleted: true
            }
        });
        
        sendToRoom(p.mission_id, JSON.stringify({
            act: 'delete_note',
            arg: note._id
        }));

    } catch (err) {
        logger.error(err);
        throw('Error deleting note.');
    }
}
// ------------------------------------------------------------------------------------------------------------------- /NOTES


// OPNOTES -------------------------------------------------------------------------------------------------------------------
async function getOpnotes(p) {
    try {
        return await mdb.collection('opnotes').aggregate([
            {
                $match: { mission_id: objectid(p.mission_id), deleted: { $ne: true }}
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
    } catch (err) {
        logger.error(err);
        throw('Error getting opnotes.')
    }
}

// insert opnote
async function insertOpnote(p, opnote) {
    try {
        opnote.user_id = p.user_id;
        opnote.target = xssFilters.inHTMLData(opnote.target);
        opnote.tool = xssFilters.inHTMLData(opnote.tool);
        opnote.action = xssFilters.inHTMLData(opnote.action);

        var new_values = { mission_id: objectid(p.mission_id), event_id: null, opnote_time: opnote.opnote_time, target: opnote.target, tool: opnote.tool, action: opnote.action, user_id: objectid(opnote.user_id), deleted: false };

        if (objectid.isValid(opnote.event_id)) {
            new_values.event_id = objectid(opnote.event_id);
        }

        var res = await mdb.collection('opnotes').insertOne(new_values);

        opnote._id = new_values._id;
        opnote.username = p.username;
        sendToRoom(p.mission_id, JSON.stringify({act: 'insert_opnote', arg: opnote}));

    } catch (err) {
        logger.error(err);
        throw('Error: inserting opnote.');
    }
}

async function updateOpnote(p, opnote) {
    try {
        opnote.target = xssFilters.inHTMLData(opnote.target);
        opnote.tool = xssFilters.inHTMLData(opnote.tool);
        opnote.action = xssFilters.inHTMLData(opnote.action);

        var new_values = { $set: { opnote_time: opnote.opnote_time, event_id: null, target: opnote.target, tool: opnote.tool, action: opnote.action } };

        if (objectid.isValid(opnote.event_id))
            new_values.$set.event_id = objectid(opnote.event_id);

        var res = await mdb.collection('opnotes').updateOne({ _id: objectid(opnote._id) }, new_values);
        if (res.result.ok === 1) {
            opnote.username = p.username;
            sendToRoom(p.mission_id, JSON.stringify({
                act: 'update_opnote',
                arg: opnote
            }));
        } else {
            throw('updateOpnote error.');
        }

    } catch (err) {
        logger.error(err);
        throw('Error: updating opnote.');
    }
}

// delete opnote
async function deleteOpnote(p, opnote) {
    try {
        var res = await mdb.collection('opnotes').updateOne({
            _id: objectid(opnote._id)
        }, {
            $set: {
                deleted: true
            }
        });
        if (res.result.ok === 1) {
            sendToRoom(p.mission_id, JSON.stringify({
                act: 'delete_opnote',
                arg: opnote._id
            }));
        } else {
            throw('deleteOpnote error.');
        }

    } catch (err) {
        logger.error(err);
        throw('Error: deleting opnote.');
    }
}
// ------------------------------------------------------------------------------------------------------------------- /OPNOTES

// EVENTS -------------------------------------------------------------------------------------------------------------------
// get events
async function getEvents(p) {
    try {
        var events = await mdb.collection('events').aggregate([{
            $match: {
                mission_id: objectid(p.mission_id),
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
                assigned_user_id: 1,
                username: '$username.username'
            }
        }]).toArray();
        
        return events;

    } catch (err) {
        logger.error(err);
        throw('Error getting events.');
    }
}

// insert event
async function insertEvent(p, event) {
    try {
        event.event_type = xssFilters.inHTMLData(event.event_type);
        event.short_desc = xssFilters.inHTMLData(event.short_desc);
        event.source_port = xssFilters.inHTMLData(event.source_port);
        event.dest_port = xssFilters.inHTMLData(event.dest_port);
        event.user_id = p.user_id;
        event.username = p.username;

        var evt = {
            mission_id: objectid(p.mission_id),
            event_time: event.event_time,
            discovery_time: event.discovery_time,
            source_object: null,
            source_port: event.source_port,
            dest_object: null,
            dest_port: event.dest_port,
            event_type: event.event_type,
            short_desc: event.short_desc,
            user_id: objectid(p.user_id),
            assigned_user_id: null,
            deleted: false
        };

        if (event.source_object && objectid.isValid(event.source_object)) {
            evt.source_object = objectid(event.source_object);
        }

        if (event.dest_object && objectid.isValid(event.dest_object)) {
            evt.dest_object = objectid(event.dest_object);
        }

        if (event.assigned_user_id && objectid.isValid(event.assigned_user_id)) {
            evt.assigned_user_id = objectid(event.assigned_user_id);
        }

        var res = await mdb.collection('events').insertOne(evt);
        event._id = evt._id;
        return event;

    } catch (err) {
        logger.error(err);
        throw('Error: inserting event.');
    }
}

// update event
async function updateEvent(p, event) {
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
                assigned_user_id: null
            }
        };

        if (event.source_object && objectid.isValid(event.source_object))
            new_values.$set.source_object = objectid(event.source_object);
        if (event.dest_object && objectid.isValid(event.dest_object))
            new_values.$set.dest_object = objectid(event.dest_object);
        if (event.assigned_user_id && objectid.isValid(event.assigned_user_id))
            new_values.$set.assigned_user_id = objectid(event.assigned_user_id);

        var res = await mdb.collection('events').updateOne({
            _id: objectid(event._id)
        }, new_values);
        if (res.result.ok === 1) {
            sendToRoom(p.mission_id, JSON.stringify({
                act: 'update_event',
                arg: event
            }));
        } else {
            throw('updateEvent error');
        }

    } catch (err) {
        logger.error(err);
        throw('Error: updating event.');
    }
}

// delete event
async function deleteEvent(p, event) {
    try {
        var res = await mdb.collection('events').updateOne({
            _id: objectid(event._id)
        }, {
            $set: {
                deleted: true
            }
        });
        if (res.result.ok === 1) {
            sendToRoom(p.mission_id, JSON.stringify({
                act: 'delete_event',
                arg: event._id
            }));
        } else {
            throw('deleteEvent error.');
        }

    } catch (err) {
        logger.error(err);
        throw('Error: deleting event.')
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
    get_users: { function: getUsers, checks: adminMessageCheck, permission: '' },
    get_missions: { function: getMissions, checks: function () { return true; }, permission: '' },
    get_chats: { function: getChats, checks: function() { return true; } },
    get_old_chats: { function: getOldChats, checks: missionMessageCheck, permission: '' },
    get_chat_channels: { function: getChatChannels, checks: missionMessageCheck, permission: '' },
    get_mission_users: { function: getMissionUsers, checks: missionMessageCheck, permission: 'manage_users' },
    get_files: { function: getFiles, checks: missionMessageCheck, permission: '' },
    get_notes: { function: getNotes, checks: missionMessageCheck, permission: '' },
    get_opnotes: { function: getOpnotes, checks: missionMessageCheck, permission: '' },
    get_events: { function: getEvents, checks: missionMessageCheck, permission: '' },

    insert_mission: { function: insertMission, params: ['mission_id', 'user_id', 'username'], checks: function() { return true; }, permission: '' },
    update_mission: { function: updateMission, checks: adminMessageCheck, permission: '' },
    delete_mission: { function: deleteMission, checks: adminMessageCheck },

    insert_user: { function: insertUser, checks: adminMessageCheck, permission: '' },
    update_user: { function: updateUser, checks: adminMessageCheck, permission: '' },
    delete_user: { function: deleteUser, checks: adminMessageCheck, permission: '' },
    update_user_status: { function: updateUserStatus, checks: missionMessageCheck, permission: '' },

    insert_chat: { function: insertChat, checks: missionMessageCheck, permission: 'write_access' },
    update_chat: { function: updateChat, checks: missionMessageCheck, permission: 'write_access' },
    delete_chat: { function: deleteChat, checks: missionMessageCheck, permission: 'delete_access' },
    insert_chat_channel: { function: insertChatChannel, checks: missionMessageCheck, permission: 'write_access' },

    insert_mission_user: { function: insertMissionUser, checks: missionMessageCheck, permission: 'manage_users' },
    update_mission_user: { function: updateMissionUser, checks: missionMessageCheck, permission: 'manage_users' },
    delete_mission_user: { function: deleteMissionUser, checks: missionMessageCheck, permission: 'manage_users' },
    
    insert_file: { function: insertFile, checks: missionMessageCheck, permission: 'write_access' },
    update_file: { function: moveFile, checks: missionMessageCheck, permission: 'write_access' },
    delete_file: { function: deleteFile, checks: missionMessageCheck, permission: 'delete_access'},

    insert_note: { function: insertNote, checks: missionMessageCheck, permission: 'write_access' },
    update_note: { function: updateNote, checks: missionMessageCheck, permission: 'write_access' },
    delete_note: { function: deleteNote, checks: missionMessageCheck, permission: 'delete_access' },
    
    insert_opnote: { function: insertOpnote, checks: missionMessageCheck, permission: 'write_access' },
    update_opnote: { function: updateOpnote, checks: missionMessageCheck, permission: 'write_access' },
    delete_opnote: { function: deleteOpnote, checks: missionMessageCheck, permission: 'delete_access' },
    
    insert_event: { function: insertEvent, checks: missionMessageCheck, permission: 'write_access' },
    update_event: { function: updateEvent, checks: missionMessageCheck, permission: 'write_access' },
    delete_event: { function: deleteEvent, checks: missionMessageCheck, permission: 'delete_access' }
};

// SOCKET -------------------------------------------------------------------------------------------------------------------
function sharedbOnMessage(msg, flags) {
    try {
        msg = JSON.parse(msg);
    } catch (e) {
        return;
    }

    if (msg.act && this.loggedin) {
        switch (msg.act) {
            case 'join':
                // trying to join without perms
                if (!this.mission_permissions || !this.mission_permissions[msg.arg.mission_id]) {
                    this.send(JSON.stringify({
                        act: 'msg',
                        arg: { title: 'Error!', text: 'Denied.' }
                    }));
                    this.close();
                    break;
                }

                // good to start sharedb
                this.send(JSON.stringify({
                    act: 'ack',
                    arg: ''
                }));

                this.mission_id = msg.arg.mission_id;

                // remove this listener
                this.off('message', sharedbOnMessage)

                // start sharedb connection
                var stream = new wsjsonstream(this);
                backend.listen(stream, { mission_id: msg.arg.mission_id, user_id: this.user_id, username: this.username });
                break;
        }
    }
}

async function setupShareDBSocket(socket) {
    if (!socket.loggedin) {
        socket.close();
        return;
    }

    socket.on('pong', function () {
        socket.isAlive = true;
    });
    socket.type = 'sharedb';
  
    socket.on('message', sharedbOnMessage);

    socket.on('close', function() {
    });
        
}

async function setupGraphSocket(socket) {
    if (!socket.loggedin) {
        socket.close();
        return;
    }

    socket.on('pong', function () {
        socket.isAlive = true;
    });

    socket.on('close', function() {
        try {
            // cleanup closed sockets from rooms
            if (socket.rooms) {
                for (var i = 0; i < socket.rooms.length; i++) {
                    if (rooms.get(socket.rooms[i])) {
                        rooms.get(socket.rooms[i]).sockets.delete(socket);

                        // room now empty, delete
                        if (rooms.get(socket.rooms[i]).sockets.size === 0) {
                            rooms.delete(socket.rooms[i]);

                            /*
                            // user's last socket is gone
                            if (socket.user_id && socket.rooms[i] === socket.user_id) {
                                
                            }*/
                        }
                    }
                }

                if(users.get(socket.user_id) && --users.get(socket.user_id).count == 0) {
                    users.delete(socket.user_id);
                    sendToAllRooms(JSON.stringify({
                        act: 'update_user_status',
                        arg: [{ _id: socket.user_id, status: 'offline' }]
                    }));
                }
            }
        } catch (err) {
            logger.error(err);
        }
    })

    socket.on('message', async function (msg, flags) {
        try {
            msg = JSON.parse(msg);
        } catch (err) {
            logger.error(err);
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
                    try {
                        // trying to join without perms
                        if (!socket.mission_permissions || !socket.mission_permissions[msg.arg.mission_id]) {
                            socket.send(JSON.stringify({
                                act: 'msg',
                                arg: { title: 'Error!', text: 'Denied.' }
                            }));
                            socket.close();
                            break;
                        }

                        // grab the graph and load it into memory if necessary
                        if (!await loadGraph(msg.arg.mission_id)) {
                            socket.send(JSON.stringify({
                                act: 'msg',
                                arg: { title: 'Error!', text: 'Invalid mission ID.' }
                            }));
                            socket.close();
                            break;
                        }

                        socket.rooms = [ msg.arg.mission_id, socket.user_id ];
                        socket.mission_id = msg.arg.mission_id;
                        socket.type = 'graph';

                        // add user to graph
                        var graph = graphs.get(socket.mission_id);

                        // mission socket room
                        if (!rooms.get(socket.mission_id)) {
                            rooms.set(socket.mission_id, { type: 'graph', sockets: new Set() });
                        }

                        // user socket room
                        if (!rooms.get(socket.user_id)) {
                            rooms.set(socket.user_id, { type: 'channel', sockets: new Set() });
                        }

                        // add user to user status tracker and mark online
                        if (!users.get(socket.user_id)) {
                            users.set(socket.user_id, { status: 'online', count: 1 });
                        } else {
                            users.get(socket.user_id).count++;
                        }
                        sendToAllRooms(JSON.stringify({
                            act: 'update_user_status',
                            arg: [{ _id: socket.user_id, status: 'online' }]
                        }));

                        // join mission room
                        rooms.get(socket.mission_id).sockets.add(socket);

                        // join personal room
                        rooms.get(socket.user_id).sockets.add(socket);

                        var resp = [];
                        var tusers = [];

                        resp.push({ act: 'get_graph', arg: JSON.stringify(graph) });
                        
                        if (socket.mission_permissions[socket.mission_id].manage_users) {
                            tusers = await getUsers(socket.mission_id, true);
                        }

                        resp.push({ act: 'get_mission_users', arg: await getMissionUsers(socket) });
                        resp.push({ act: 'get_notes', arg: await getNotes(socket) });
                        resp.push({ act: 'get_files', arg: await getFiles(socket) });
                        resp.push({ act: 'get_events', arg: await getEvents(socket) });
                        resp.push({ act: 'get_opnotes', arg: await getOpnotes(socket) });
                        resp.push({ act: 'get_presence', arg: await getPresence(socket) });

                        // get mission channels
                        var channels = await getChatChannels(socket.mission_id, socket.user_id);

                        // join mission channels
                        for (var i = 0; i < channels.length; i++) {
                            if (channels[i].type === 'channel') {
                                if (!rooms.get(channels[i]._id.toString())) {
                                    rooms.set(channels[i]._id.toString(), { type: 'channel', sockets: new Set() });
                                }
                                rooms.get(channels[i]._id.toString()).sockets.add(socket);
                            }
                        }
                        resp.push({ act: 'get_chat_channels', arg: channels });
                        resp.push({ act: 'get_chats', arg: await getChats(socket, channels) });
                        resp.push({ act: 'get_users', arg: tusers });

                        socket.send(JSON.stringify(resp));
                    } catch (err) {
                        logger.error(err);
                    }
                    break;

                case 'main':
                    // join main room
                    socket.rooms = [ 'main' ];
                    if (!rooms.get('main')) {
                        rooms.set('main', { type: 'main', sockets: new Set() });
                    }
                    rooms.get('main').sockets.add(socket);
                    socket.type = 'main';
                    break;

                case 'config':
                    // join config room
                    socket.rooms = [ 'config' ];
                    if (!rooms.get('config')) {
                        rooms.set('config', { type: 'config', sockets: new Set() });
                    }
                    rooms.get('config').sockets.add(socket);
                    socket.type = 'config';
                    break;

                /*
                case 'get_missions':
                    getMissions(socket);
                    break;
                    */

                case 'update_graph':
                    var results = [];

                    var graph = graphs.get(socket.mission_id);

                    if (!graph) {
                        socket.send(JSON.stringify({
                            act: 'msg',
                                arg: { title: 'Error!', text: 'Invalid mission ID.' }
                        }));
                        return;
                    }

                    for (var i = 0; i < msg.arg.length; i++) {
                        var type = msg.arg[i].type;
                        var res = { type: type };
                        
                        switch(type) {
                            case 'mxChildChange':
                                res[type] = mxChildChange(msg.arg[i].mxChildChange, graph, socket);
                                break;
                            case 'mxGeometryChange':
                                res[type] = mxGeometryChange(msg.arg[i].mxGeometryChange, graph);
                                break;
                            case 'mxStyleChange':
                                res[type] = mxStyleChange(msg.arg[i].mxStyleChange, graph);
                                break;
                            case 'mxTerminalChange':
                                res[type] = mxTerminalChange(msg.arg[i].mxTerminalChange, graph);
                                break;
                            case 'mxValueChange':
                                res[type] = mxValueChange(msg.arg[i].mxValueChange, graph, socket);
                                break;
                        }
                        if (res[type] !== undefined) {
                            results.push(res);
                        }
                    }

                    // save changes
                    if (!saveGraph(socket.mission_id, graph)) {
                        socket.send(JSON.stringify({
                            act: 'msg',
                            arg: { title: 'Error!', text: 'Error saving graph.' }
                        }));
                    }
                      
                    sendToRoom(socket.mission_id, JSON.stringify({ act: 'update_graph', arg: results }), socket);
                    break;

                default:
                    if (messageHandlers[msg.act]) {
                        if (messageHandlers[msg.act].checks(socket, messageHandlers[msg.act].permission) && ajv.validate(validators[msg.act], msg.arg)) {
                            try {

                                var data = await messageHandlers[msg.act].function(socket, msg.arg);
                                if (data) {
                                    socket.send(JSON.stringify({
                                        act: msg.act,
                                        arg: data
                                    }));
                                }
                            } catch (err) {
                                socket.send(JSON.stringify({
                                    act: 'msg',
                                    arg: { title: 'Error!', text: err }
                                }));
                            }
                        } else {
                            socket.send(JSON.stringify({
                                act: 'msg',
                                arg: { title: 'Error!', text: 'Permission denied or invalid data.' }
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
    var msg = {};
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
    if (rooms.get(mission_id)) {
        for (var i = rooms.get(mission_id).sockets.values(), socket = null; socket = i.next().value; ) {
            if (socket.readyState === socket.OPEN && socket.mission_id === mission_id && socket.user_id === user_id) {
                return socket;
            }
        };
    }
    return null;
}

app.post('/upload', upload.any(), function (req, res) {
    try {
        if (!req.session.loggedin || !req.session.mission_permissions[req.body.mission_id].write_access) {
            throw('app.post /upload Not signed in.');
        }

        if ((req.body.channel_id !== undefined || req.body.parent_id !== undefined || req.body.position !== undefined) && req.body.mission_id) {
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

                // check if we already have this file saved, if so don't save another copy
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
                        var res = await insertFile(s, newFile); 
                        sendToRoom(s.mission_id, JSON.stringify({ act: 'insert_file', arg: res }));
                        callback();                       
                    }
                    // chat upload
                    else if (req.body.channel_id || req.body.position) {
                        var res = await mdb.collection('missions').findOne({
                            _id: objectid(req.body.mission_id),
                            deleted: {
                                $ne: true
                            }
                        }, {
                            projection: {
                                chat_files_root: 1,
                                graph_files_root: 1
                            }
                        });
                        newFile.name = file.originalname;

                        var buffer = readChunk.sync(base + '/' + hash, 0, fileType.minimumBytes);
                        var filetype = fileType(buffer);
                        var mimetype = mime.lookup(file.originalname);
                        var extension = 'unk';
                        var mimestr = 'unknown file type';
                        if (filetype) {
                            extension = filetype.ext;
                            mimestr = filetype.mime;
                        } else if (mimetype) {
                            extension = mime.extension(mimetype);
                            mimestr = mimetype;
                        }                            

                        if (req.body.channel_id) {
                            newFile.parent_id = res.chat_files_root;
                            var new_id = await insertFile(s, newFile, true);
                            
                            if (filetype && (filetype.mime === 'image/png' || filetype.mime === 'image/jpg' || filetype.mime === 'image/gif')) {
                                insertChat(s, { text: '<img class="chatImage" src="/render/' + hash + '">', channel_id: req.body.channel_id, type: req.body.type, editable: false }, false);
                            } else {
                                insertChat(s, { text: '<a href="/download?file_id=' + new_id + '&mission_id=' + req.body.mission_id + '"><div class="chatFile"><img class="chatIcon" src="/images/file_types/' + extension + '.svg"><div class="chatFileDescription"><div class="chatFileName">' + file.originalname + '</div><div class="chatFileSize">' + mimestr + ' (' + readableBytes(file.size) + ')</div></div></div></a>', channel_id: req.body.channel_id, type: req.body.type, editable: false }, false);
                            }

                        // file upload to graph
                        } else {
                            newFile.parent_id = res.graph_files_root;
                            new_id = await insertFile(s, newFile, true);

                            var position = JSON.parse(req.body.position);
                            var url = '<a href="/download?file_id=' + new_id + '&mission_id=' + req.body.mission_id + '">' + file.originalname + '</a>';
                            var change = [{ type: 'mxChildChange', mxChildChange: { parent: 1, mxCell: { id: objectid(null).toString(), mxGeometry: { x: position.x, y: position.y, width: 30, height: 30 }, parent: '1', style: 'editable=0;html=1;shape=image;image=/images/file_types/' + extension + '.svg', value: url, vertex: true }}}]
                            var graph = graphs.get(s.mission_id);
                            if (graph) {
                                mxChildChange(change[0].mxChildChange, graph);
                                sendToRoom(s.mission_id, JSON.stringify({ act: 'update_graph', arg: change }));
                            }
                        }
                        callback();
                    }
                    else {
                        callback('Error uploading file.');
                    }
                    
                });
                
            }, function (err) {
                res.send('{}');
            });
        } else {
            throw('app.post /upload invalid parameters.')
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
