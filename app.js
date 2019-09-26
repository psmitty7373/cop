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
const sharedbmongo = require('sharedb-mongo')
const multer = require('multer');
const objectid = require('mongodb').ObjectID;
const path = require('path');
const ShareDB = require('sharedb');
const richText = require('rich-text');
const rooms = new Map();
const upload = multer({
    dest: './temp_uploads'
});
const wsjsonstream = require('websocket-json-stream');
const xssFilters = require('xss-filters');
const wss = require('ws');
const ws = new wss.Server({
    server: http
});

app.set('view engine', 'pug');
app.use(express.static('public'));
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({
    extended: true
}));
app.use(pino)
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

async function insertLogEvent(socket, message, channel) {
    try {
        if (!channel || channel === '')
            channel = 'log';
        var timestamp = (new Date).getTime();
        var log = {
            mission_id: objectid(socket.mission_id),
            user_id: objectid(socket.user_id),
            channel: channel,
            text: message,
            timestamp: timestamp,
            deleted: false
        };
    
        var res = await mdb.collection('chats').insertOne(log);
        log.username = socket.username;
        sendToRoom(socket.room, JSON.stringify({
            act: 'chat',
            arg: [log]
        }));
        return [];
    } catch (err) {
        logger.error(err);
        return [];
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

// OBJECTS -------------------------------------------------------------------------------------------------------------------
// get object listing
async function getObjects(socket) {
    try {
        var objects = await mdb.collection('objects').find({
            mission_id: objectid(socket.mission_id),
            deleted: {
                $ne: true
            }
        }).sort({
            z: 1
        }).toArray();
        socket.send(JSON.stringify({
            act: 'get_objects',
            arg: objects
        }));
    } catch (err) {
        socket.send(JSON.stringify({
            act: 'error',
            arg: {
                text: 'Error getting objects.'
            }
        }));
        socket.send(JSON.stringify({
            act: 'get_objects',
            arg: []
        }));
        logger.error(err);
    }
}

async function insertObject(socket, object) {
    try {
        object.rot = 0;
        object.scale_x = 1;
        object.scale_y = 1;
        if (object.type === 'shape') {
            object.scale_x = 65;
            object.scale_y = 65;
        }
        object.type = xssFilters.inHTMLData(object.type);
        object.name = xssFilters.inHTMLData(object.name);
        object.fill_color = xssFilters.inHTMLData(object.fill_color);
        object.stroke_color = xssFilters.inHTMLData(object.stroke_color);
        object.image = xssFilters.inHTMLData(object.image);

        // get object count for new z
        var count = await mdb.collection('objects').count({
            mission_id: objectid(socket.mission_id)
        });

        var new_object;
        if (object.type === 'icon' || object.type === 'shape')
            new_object = {
                mission_id: objectid(socket.mission_id),
                type: object.type,
                name: object.name,
                fill_color: object.fill_color,
                stroke_color: object.stroke_color,
                image: object.image,
                scale_x: object.scale_x,
                scale_y: object.scale_y,
                rot: object.rot,
                x: object.x,
                y: object.y,
                z: count,
                locked: object.locked,
                deleted: false
            };
        else if (object.type === 'link')
            new_object = {
                mission_id: objectid(socket.mission_id),
                type: object.type,
                name: object.name,
                stroke_color: object.stroke_color,
                image: object.image,
                obj_a: objectid(object.obj_a),
                obj_b: objectid(object.obj_b),
                z: 0,
                locked: object.locked,
                deleted: false
            };
        // add object to db
        var res = await mdb.collection('objects').insertOne(new_object);

        if (res.result.ok === 1) {
            // if link, push to back
            if (object.type === 'link') {
                var rows = await mdb.collection('objects').find({
                    $and: [{
                        mission_id: objectid(socket.mission_id)
                    }, {
                        deleted: {
                            $ne: true
                        }
                    }]
                }, {
                    _id: 1
                }).sort({
                    z: 1
                }).toArray();
                console.log(rows);

                var zs = rows.map(r => String(r._id));
                zs.move(zs.indexOf(String(new_object._id)), 0);
                async.forEachOf(zs, function (item, index, callback) {
                    var new_values = {
                        $set: {
                            z: index
                        }
                    };
                    mdb.collection('objects').updateOne({
                        _id: objectid(item)
                    }, new_values, function (err, result) {
                        if (err)
                            callback(err);
                        else
                            callback();
                    });
                }, function (err) {
                    insertLogEvent(socket, 'Created ' + object.type + ': ' + object.name + '.');
                    sendToRoom(socket.room, JSON.stringify({
                        act: 'insert_object',
                        arg: [new_object]
                    }));
                });

            } else {
                // push object back to room
                insertLogEvent(socket, 'Created ' + object.type + ': ' + object.name + '.');
                sendToRoom(socket.room, JSON.stringify({
                    act: 'insert_object',
                    arg: [new_object]
                }));
            }
        } else {
            logger.error('[!] insert_object failed.');
        }
    } catch (err) {
        socket.send(JSON.stringify({
            act: 'error',
            arg: {
                text: 'Error inserting object.'
            }
        }));
        logger.error(err);
    }
}

async function pasteObject(socket, objects) {
    var args = [];
    async.eachOf(objects, async function (o, index, callback) {
    //if (ajv.validate(validators.paste_object, o)) {
        try {
            var row = await mdb.collection('objects').findOne({
                _id: objectid(o._id),
                type: {
                    $ne: 'link'
                },
                deleted: {
                    $ne: true
                }
            });

            if (row) {
                row._id = objectid(null);
                row.z = o.z;
                row.x = o.x;
                row.y = o.y;

                var res = await mdb.collection('objects').insertOne(row);
                insertLogEvent(socket, 'Created ' + row.type + ': ' + row.name + '.');
                args.push(row);
            }

            callback();

        } catch (err) {
            socket.send(JSON.stringify({
                act: 'error',
                arg: {
                    text: 'Error inserting object.'
                }
            }));
            callback(err);
        }
    }, function (err) {
        if (err) {
            logger.error(err);
        } else {
            sendToRoom(socket.room, JSON.stringify({
                act: 'insert_object',
                arg: args
            }));
        }
    });
}

async function deleteObject(socket, object) {
    try {
        var query = {
            $or: [{
                _id: objectid(object._id)
            }, {
                obj_a: objectid(object._id)
            }, {
                obj_b: objectid(object._id)
            }]
        };
        var o_rows = await mdb.collection('objects').find(query, {
            _id: 1
        }).toArray();

        async.each(o_rows, function (row, callback) {
            mdb.collection('objects').updateOne({
                _id: objectid(row._id)
            }, {
                $set: {
                    deleted: true
                }
            }, function (err, result) {
                if (!err) {
                    sendToRoom(socket.room, JSON.stringify({
                        act: 'delete_object',
                        arg: row._id
                    }));
                } else
                    logger.error(err);
            });
        }, async function (err) {
            var rows = await mdb.collection('objects').find({
                $and: [{
                    mission_id: objectid(socket.mission_id)
                }, {
                    deleted: {
                        $ne: true
                    }
                }]
            }, {
                _id: 1
            }).sort({
                z: 1
            }).toArray();

            var zs = rows.map(r => String(r._id));
            async.forEachOf(zs, function (item, index, callback) {
                var new_values = {
                    $set: {
                        z: index
                    }
                };
                mdb.collection('objects').updateOne({
                    _id: objectid(item)
                }, new_values, function (err, result) {
                    if (err)
                        callback(err)
                    else
                        callback();
                });
            });
        });
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

async function changeObject(socket, object) {
    try {
        object.name = xssFilters.inHTMLData(object.name);
        object.fill_color = xssFilters.inHTMLData(object.fill_color);
        object.stroke_color = xssFilters.inHTMLData(object.stroke_color);
        object.image = xssFilters.inHTMLData(object.image);

        var new_values = {
            $set: {
                name: object.name,
                fill_color: object.fill_color,
                stroke_color: object.stroke_color,
                image: object.image,
                locked: object.locked
            }
        };

        var res = await mdb.collection('objects').updateOne({
            _id: objectid(object._id)
        }, new_values);

        if (res.result.ok === 1) {
            insertLogEvent(socket, 'Modified object: ' + object.name + ' ID: ' + object._id + '.');
            sendToRoom(socket.room, JSON.stringify({
                act: 'change_object',
                arg: object
            }));
        } else {
            socket.send(JSON.stringify({
                act: 'error',
                arg: {
                    text: 'Error updating object.'
                }
            }));
        }
    } catch (err) {
        socket.send(JSON.stringify({
            act: 'error',
            arg: {
                text: 'Error updating object.'
            }
        }));
        logger.error(err);
    }
}

async function moveObject(socket, objects) {
    objects.sort(dynamicSort('z'));

    var args = []; // for x/y moves
    var args_broadcast = []; // for z moves... to everyone

    var rows = await mdb.collection('objects').find({
        mission_id: objectid(socket.mission_id),
        deleted: {
            $ne: true
        }
    }, {
        _id: 1,
        z: 1,
        name: 1
    }).sort({
        z: 1
    }).toArray();

    if (rows) {
        var zs = rows.map(r => String(r._id));
        async.eachOf(objects, async function (o, index, callback) {
            // move objects (z-axis)
            if (o.z !== zs.indexOf(o._id)) {
                o.z = Math.floor(o.z);
                zs.move(zs.indexOf(String(o._id)), o.z);
                async.forEachOf(zs, async function (item, index, callback) {
                    try {
                        var new_values = {
                            $set: {
                                z: index
                            }
                        };
                        var res = await mdb.collection('objects').updateOne({
                            _id: objectid(item)
                        }, new_values);

                        if (res.result.ok === 1) {
                            if (item === o._id)
                                args_broadcast.push(o);

                            callback();
                        } else {
                            socket.send(JSON.stringify({
                                act: 'error',
                                arg: {
                                    text: 'Error updating object.'
                                }
                            }));
                            callback('Error updating object.');
                        }                                
                    } catch (err) {
                        callback(err);
                    }                            
                }, function (err) { // async callback
                    if (err)
                        callback(err);
                    else
                        callback();
                });

            // move objects (x/y axis)
            } else {
                try {
                    o.x = Math.round(o.x);
                    o.y = Math.round(o.y);
                    var new_values = {
                        $set: {
                            x: o.x,
                            y: o.y,
                            scale_x: o.scale_x,
                            scale_y: o.scale_y,
                            rot: o.rot
                        }
                    };

                    var res = await mdb.collection('objects').updateOne({
                        _id: objectid(o._id)
                    }, new_values);

                    if (res.result.ok === 1) {
                        args.push(o);
                        callback();
                    } else {
                        socket.send(JSON.stringify({
                            act: 'error',
                            arg: {
                                text: 'Error updating object.'
                            }
                        }));
                        callback('Error updating object.');
                    }
                } catch (err) {
                    callback(err);
                }
            }
        }, function (err) { // async callback
            if (err) {
                logger.error(err);
            } else {
                // send object moves only to everyone else
                sendToRoom(socket.room, JSON.stringify({
                    act: 'move_object',
                    arg: args.concat(args_broadcast)
                }), socket);

                // send z-moves to everyone
                socket.send(JSON.stringify({
                    act: 'move_object',
                    arg: args_broadcast
                }));
            }
        });
    } else {
        socket.send(JSON.stringify({
            act: 'error',
            arg: {
                text: 'Error updating object.'
            }
        }));
    }

}
// ------------------------------------------------------------------------------------------------------------------- /OBJECTS

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
        res.ops[0].password = '';
        sendToRoom(socket.room, JSON.stringify({
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

            sendToRoom(socket.room, JSON.stringify({
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
            socket.send(JSON.stringify({
                act: 'error',
                arg: {
                    text: 'Error updating user.'
                }
            }));
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
            sendToRoom(socket.room, JSON.stringify({
                act: 'delete_user',
                arg: user._id
            }));
        } else {
            socket.send(JSON.stringify({
                act: 'error',
                arg: {
                    text: 'Error deleting user.'
                }
            }));
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
        var mission = {
            name: mission.name,
            user_id: objectid(socket.user_id),
            mission_users: [],
            channels: [{ _id: objectid(null), name: 'log', deleted: false }, { _id: objectid(null), name: 'general', deleted: false }],
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
        sendToRoom(socket.room, JSON.stringify({
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
            sendToRoom(socket.room, JSON.stringify({
                act: 'update_mission',
                arg: mission
            }));
        } else {
            socket.send(JSON.stringify({
                act: 'error',
                arg: {
                    text: 'Error updating mission.'
                }
            }));
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
            _id: objectid(mission)
        }, {
            $set: {
                deleted: true
            }
        });
        if (res.result.ok === 1) {
            sendToRoom(socket.room, JSON.stringify({
                act: 'delete_mission',
                arg: mission
            }));
        } else {
            socket.send(JSON.stringify({
                act: 'error',
                arg: {
                    text: 'Error deleting mission.'
                }
            }));
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
        var channels = await mdb.collection('missions').aggregate([{
            $match: {
                _id: objectid(socket.mission_id),
                deleted: {
                    $ne: true
                }
            }
        }, {
            $unwind: '$channels'
        }, {
            $project: {
                _id: '$channels._id',
                name: '$channels.name'
            }
        }]).toArray();

        socket.send(JSON.stringify({
            act: 'get_channels',
            arg: channels
        }));
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
    }
}

// add new chat channel
async function insertChatChannel(socket, channel) {
    try {
        // check if channel already exists
        var count = await mdb.collection('missions').count({
            _id: objectid(socket.mission_id),
            'channels.name': channel.name
        });

        // don't add existing channel
        if (count === 0) {
            var new_values = {
                _id: objectid(null),
                name: channel.name
            };

            var res = await mdb.collection('missions').updateOne({
                _id: objectid(socket.mission_id)
            }, {
                $push: {
                    channels: new_values
                }
            });

            if (res.result.ok === 1) {
                sendToRoom(socket.room, JSON.stringify({
                    act: 'insert_chat_channel',
                    arg: new_values
                }));
            } else {
                socket.send(JSON.stringify({
                    act: 'error',
                    arg: {
                        text: 'Error inserting channel.'
                    }
                }));
            }
        } else {
            socket.send(JSON.stringify({
                act: 'error',
                arg: {
                    text: 'Channel already exists.'
                }
            }));
        }
    } catch (err) {
        socket.send(JSON.stringify({
            act: 'error',
            arg: {
                text: 'Error inserting channel.'
            }
        }));
        logger.error(err);
    }
}

// get 50 most recent messages for chat
async function getChats(socket) {
    try {
        var chats = [];
        var channels = await mdb.collection('chats').distinct('channel');
        for (var i = 0; i < channels.length; i++) {
            var rows = await mdb.collection('chats').aggregate([{
                $match: {
                    mission_id: objectid(socket.mission_id),
                    channel: channels[i],
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

// insert chat
async function insertChat(socket, chat) {
    try {
        chat.username = socket.username;
        chat.user_id = socket.user_id;
        chat.text = xssFilters.inHTMLData(chat.text);
        chat.timestamp = (new Date).getTime();
        var chat_row = {
            mission_id: objectid(socket.mission_id),
            user_id: objectid(socket.user_id),
            channel: chat.channel,
            text: chat.text,
            timestamp: chat.timestamp,
            deleted: false
        };
        
        var res = await mdb.collection('chats').insertOne(chat_row);
        sendToRoom(socket.room, JSON.stringify({
            act: 'chat',
            arg: [chat]
        }));
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

// get old chats
async function getOldChats(socket, request) {
    try {
        var rows = await mdb.collection('chats').aggregate([{
            $match: {
                mission_id: objectid(socket.mission_id),
                channel: request.channel,
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
            if (res.result.ok === 1) {
                var user = await mdb.collection('users').findOne({
                    _id: objectid(user.user_id),
                    deleted: {
                        $ne: true
                    }
                });
                new_values.username = user.username;
                sendToRoom(socket.room, JSON.stringify({
                    act: 'insert_mission_user',
                    arg: new_values
                }));
            } else {
                socket.send(JSON.stringify({
                    act: 'error',
                    arg: {
                        text: 'Error inserting user in mission.'
                    }
                }));
            }
        } else {
            socket.send(JSON.stringify({
                act: 'error',
                arg: {
                    text: 'Error inserting user in mission.'
                }
            }));
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
        var rows = await mdb.collection('missions').aggregate([{
            $match: {
                _id: objectid(socket.mission_id),
                deleted: {
                    $ne: true
                }
            }
        }, {
            $unwind: '$mission_users'
        }, {
            $match: {
                'mission_users._id': {
                    $ne: objectid(user._id)
                },
                'mission_users.user_id': objectid(user.user_id)
            }
        }]).toArray();

        if (rows.length == 0) {
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
                sendToRoom(socket.room, JSON.stringify({
                    act: 'update_mission_user',
                    arg: user
                }));
                insertLogEvent(socket, 'Modified user setting ID: ' + user._id + '.');
            } else {
                socket.send(JSON.stringify({
                    act: 'error',
                    arg: {
                        text: 'Error updating mission user.'
                    }
                }));
            }
        } else {
            socket.send(JSON.stringify({
                act: 'error',
                arg: {
                    text: 'Error updating mission user.'
                }
            }));
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
            sendToRoom(socket.room, JSON.stringify({
                act: 'delete_mission_user',
                arg: user._id
            }));
        } else {
            socket.send(JSON.stringify({
                act: 'error',
                arg: {
                    text: 'Error deleting user from mission.'
                }
            }));
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

// get files worker
function getFilesRecursive(dir, parent, done) {
    let results = [];

    fs.readdir(dir, function(err, list) {
        if (err) {
            return done(err);
        } 

        var pending = list.length;
        if (!pending) {
            return done(null, results);
        }

        list.forEach(function(file){
            file = path.resolve(dir, file);

            fs.stat(file, function(err, stat) {
                //var rel = path.relative(base, file);
                if (stat && stat.isDirectory()) {
                    results.push({ _id: stat.ino, name: path.basename(file), type: 'dir', parent: parent });
                    getFilesRecursive(file, stat.ino, function(err, res) {
                        results = results.concat(res);
                        if (!--pending){
                            done(null, results);
                        }
                    });
                } else {
                    results.push({ _id: stat.ino, name: path.basename(file), type: 'file', parent: parent });
                    if (!--pending) {
                        done(null, results);
                    }
                }
            });
        });
    });
};

// get files
async function getFiles(socket) {
    var dir = path.join(__dirname + '/mission_files/mission-' + socket.mission_id, '/');
    try {
        // make sure directory exists for mission files
        fs.stat(dir, function (err, s) {
            if (err == null) {} else if (err.code == 'ENOENT') {
                fs.mkdir(dir, function (err) {
                    if (err) {
                        logger.error(err);
                    }
                });
            } else {
                logger.error(err);
            }
        });        

        getFilesRecursive(dir, '.', function(err, files) {
            socket.send(JSON.stringify({
                act: 'get_files',
                arg: files
            }));         
        });

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

async function insertFile(socket, dir) {
    var parent = path.normalize(dir.dst).replace(/^(\.\.[\/\\])+/, '');
    var base = path.join(__dirname, '/mission_files/mission-' + socket.mission_id + '/');
    if (parent !== 'mission-' + socket.mission_id) {
        base = path.join(base, parent);
    }
    var newdir = path.normalize(dir.name).replace(/^(\.\.[\/\\])+/, '');
    var fullpath = path.join(base, '/' + newdir)
    try {
        // make sure destination doesn't exist
        fs.stat(fullpath, function (err, s) {
            if (err === null) {
                socket.send(JSON.stringify({
                    act: 'error',
                    arg: {
                        text: 'Error: directory already exists.'
                    }
                })); 
                logger.error('[!] Error making directory.');
                return;
            }
            else if (err.code == 'ENOENT') {
                // mmake sure parent exists
                fs.stat(base, function (err, parentstat) {
                    if (err) {
                        socket.send(JSON.stringify({
                            act: 'error',
                            arg: {
                                text: 'Error creating directory.'
                            }
                        })); 
                        logger.error('[!] Error making directory.');
                        logger.error(err);
                        return;
                    }
                    // create new path
                    fs.mkdir(fullpath, function (err) {
                        if (err) {
                            socket.send(JSON.stringify({
                                act: 'error',
                                arg: {
                                    text: 'Error creating directory.'
                                }
                            }));
                            logger.error('[!] Error making directory.');
                            logger.error(err);
                        }
                        else {
                            fs.stat(fullpath, function (err, s) {
                                if (err) {
                                    socket.send(JSON.stringify({
                                        act: 'error',
                                        arg: {
                                            text: 'Error creating directory.'
                                        }
                                    })); 
                                    logger.error('[!] Error making directory.');
                                    logger.error(err);
                                    return;
                                }
                                insertLogEvent(socket, 'Created directory: ' + newdir + '.');
                                var parent = parentstat.ino;
                                if (dir.dst === '/') {
                                    parent = '.';
                                }
                                sendToRoom(socket.room, JSON.stringify({
                                    act: 'insert_file',
                                    arg: {
                                        _id: s.ino,
                                        name: newdir,
                                        type: 'dir',
                                        parent: parent
                                    }
                                }));
                            });
                        }
                    });
                });
            } else {
                socket.send(JSON.stringify({
                    act: 'error',
                    arg: {
                        text: 'Error creating directory.'
                    }
                }));
                logger.error('[!] Error making directory.');
            }
        });
    } catch (err) {
        socket.send(JSON.stringify({
            act: 'error',
            arg: {
                text: 'Error creating directory.'
            }
        }));
        logger.error('[!] Error making directory.');
    }
}

async function moveFile(socket, file) {
    var dstdir = path.normalize(file.dst).replace(/^(\.\.[\/\\])+/, '');
    var srcdir = path.normalize(file.src).replace(/^(\.\.[\/\\])+/, '');
    var base = path.join(__dirname, '/mission_files/mission-' + socket.mission_id + '/');
    dstdir = path.join(base, dstdir);
    srcdir = path.join(base, srcdir);

    try {
        fs.stat(dstdir, function (err, s) {
            if (!err) {
                socket.send(JSON.stringify({
                    act: 'error',
                    arg: {
                        text: 'Error moving file, file already exists.'
                    }
                }));
                logger.error('[!] Error moving file.', err);
            }

            fs.stat(srcdir, function (err, s) {
                if (s && (s.isDirectory() || s.isFile())) {
                    fs.rename(srcdir, dstdir, function (err) {
                        if (err) {
                            socket.send(JSON.stringify({
                                act: 'error',
                                arg: {
                                    text: 'Error moving file.'
                                }
                            }));
                            logger.error('[!] Error moving file.');
                        } else {
                            insertLogEvent(socket, 'Renamed file/dir: ' + path.basename(srcdir) + ' to ' + path.basename(dstdir) + '.');
                            
                            sendToRoom(socket.room, JSON.stringify({
                                act: 'update_file',
                                arg: {
                                    _id: s.ino,
                                    name: path.basename(dstdir),
                                    parent: path.dirname(path.relative(base, dstdir))
                                }
                            }));
                        }
                    });
                } else {
                    socket.send(JSON.stringify({
                        act: 'error',
                        arg: {
                            text: 'Error moving file.'
                        }
                    }));
                    logger.error('[!] Error moving file.');;
                    return;
                }
            });
        });
    } catch (err) {
        socket.send(JSON.stringify({
            act: 'error',
            arg: {
                text: 'Error moving file.'
            }
        }));
        logger.error(err);
    }
}

async function deleteFile(socket, file) {
    var dir = path.normalize(file.file).replace(/^(\.\.[\/\\])+/, '');
    dir = path.join(path.join(__dirname, '/mission_files/mission-' + socket.mission_id + '/'), dir);
    try {
        fs.stat(dir, function (err, s) {
            if (err) {
                socket.send(JSON.stringify({
                    act: 'error',
                    arg: {
                        text: 'Error deleting directory.'
                    }
                }));
                logger.error('[!] Error deleting directory.');
            }

            // delete directory
            else if (s && s.isDirectory()) {
                fs.rmdir(dir, function (err) {
                    if (err) {
                        socket.send(JSON.stringify({
                            act: 'error',
                            arg: {
                                text: 'Error deleting directory.'
                            }
                        }));
                        logger.error('[!] Error deleting directory.');
                    } else {
                        insertLogEvent(socket, 'Deleted file: ' + file.file + '.');
                        sendToRoom(socket.room, JSON.stringify({
                            act: 'delete_file',
                            arg: s.ino
                        }));
                    }
                });

            // delete file
            } else {
                fs.unlink(dir, function (err) {
                    if (err) {
                        socket.send(JSON.stringify({
                            act: 'error',
                            arg: {
                                text: 'Error delting file.'
                            }
                        }));
                        logger.error('[!] Error deleting file.');

                    } else {
                        insertLogEvent(socket, 'Deleted file: ' + file.file + '.');
                        sendToRoom(socket.room, JSON.stringify({
                            act: 'delete_file',
                            arg: s.ino
                        }));
                    }
                });
            }
        });
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

        var objects = await mdb.collection('objects').find({
            $and: [{
                mission_id: objectid(socket.mission_id)
            }, {
                deleted: {
                    $ne: true
                },
                //type: {
                //    $ne: 'link'
                //}
            }]
        },{ projection: projection }).sort({
            name: 1
        }).toArray();

        for (var i = 0; i < objects.length; i++) {
            objects[i].type = 'object';
            objects[i].name = objects[i].name.split('\n')[0]
        }

        socket.send(JSON.stringify({
            act: 'get_notes',
            arg: notes.concat(objects)
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
        insertLogEvent(socket, 'Created note: ' + note.name + '.');
        sendToRoom(socket.room, JSON.stringify({
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
        insertLogEvent(socket, 'Renamed note: ' + note._id + ' to: ' + note.name + '.');
        sendToRoom(socket.room, JSON.stringify({
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
        insertLogEvent(socket, 'Deleted note: ' + note._id + '.');
        sendToRoom(socket.room, JSON.stringify({
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
        insertLogEvent(socket, 'Created opnote: ' + opnote.action + ' ID: ' + opnote._id + '.');
        sendToRoom(socket.room, JSON.stringify({act: 'insert_opnote', arg: opnote}));

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
            insertLogEvent(socket, 'Modified event: ' + opnote.action + ' ID: ' + opnote._id + '.');
            sendToRoom(socket.room, JSON.stringify({
                act: 'update_opnote',
                arg: opnote
            }));
        } else {
            socket.send(JSON.stringify({
                act: 'error',
                arg: {
                    text: 'Error: updating opnote.'
                }
            }));
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
            insertLogEvent(socket, 'Deleted opnote ID: ' + opnote._id + '.');
            sendToRoom(socket.room, JSON.stringify({
                act: 'delete_opnote',
                arg: opnote._id
            }));
        } else {
            socket.send(JSON.stringify({
                act: 'error',
                arg: {
                    text: 'Error: deleting opnote.'
                }
            }));
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
        insertLogEvent(socket, 'Created event: ' + event.event_type + ' ID: ' + event._id + '.');
        sendToRoom(socket.room, JSON.stringify({
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
            insertLogEvent(socket, 'Modified event: ' + event.event_type + ' ID: ' + event._id + '.');
            sendToRoom(socket.room, JSON.stringify({
                act: 'update_event',
                arg: event
            }));
        } else {
            socket.send(JSON.stringify({
                act: 'error',
                arg: {
                    text: 'Error: updating event.'
                }
            }));
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
            insertLogEvent(socket, 'Deleted event ID: ' + event._id + '.');
            sendToRoom(socket.room, JSON.stringify({
                act: 'delete_event',
                arg: event._id
            }));
        } else {
            socket.send(JSON.stringify({
                act: 'error',
                arg: {
                    text: 'Error: deleting event.'
                }
            }));
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
    console.log(permission);
    if (socket.is_admin) {
        return true;
    }

    if(socket.mission_id && objectid.isValid(socket.mission_id) && socket.user_id && objectid.isValid(socket.user_id)) {
        if (permission !== '' && !socket.mission_permissions[socket.mission_id][permission]) {
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

messageHandlers = {
    insert_mission: { function: insertMission, checks: null, permission: '' },
    update_mission: { function: updateMission, checks: adminMessageCheck, permission: '' },
    delete_mission: { function: deleteMission, checks: adminMessageCheck },
    get_users: { function: getUsers, checks: adminMessageCheck, permission: '' },
    insert_user: { function: insertUser, checks: adminMessageCheck, permission: '' },
    update_user: { function: updateUser, checks: adminMessageCheck, permission: '' },
    delete_user: { function: deleteUser, checks: adminMessageCheck, permission: '' },
    get_chats: { function: getChats, checks: function() { return true; } },
    get_old_chats: { function:  getOldChats, checks: missionMessageCheck },
    insert_chat: { function:  insertChat, checks: missionMessageCheck, permission: '' },
    get_chat_channels: { function:  getChatChannels, checks: missionMessageCheck, permission: '' },
    insert_chat_channel: { function:  insertChatChannel, checks: missionMessageCheck, permission: '' },
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
    delete_event: { function:  deleteEvent, checks: missionMessageCheck, permission: 'delete_access' },
    insert_object: { function:  insertObject, checks: missionMessageCheck, permission: 'write_access' },
    paste_object: { function:  pasteObject, checks: missionMessageCheck, permission: 'write_access' },
    change_object: { function: changeObject, checks: missionMessageCheck, permission: 'write_access' },
    move_object: { function: moveObject, checks: missionMessageCheck, permission: 'write_access' },
    delete_object: { function:  deleteObject, checks: missionMessageCheck, permission: 'delete_access' }
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
        if (rooms.get(socket.room)) {
            rooms.get(socket.room).delete(socket);
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
                        getUsers(socket, true);
                        getMissionUsers(socket);
                    }
                    getObjects(socket);
                    getNotes(socket);
                    getChatChannels(socket);
                    getFiles(socket);
                    getChats(socket);
                    getEvents(socket);
                    getOpnotes(socket);

                    socket.send(JSON.stringify({
                        act: 'join',
                        arg: resp
                    }));
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
                            logger.error('[!] ' + msg.act + ' failed. Arguments:', msg.arg, 'Validator Errors:', ajv.errors)
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

function getPNGs(name) {
    return name.endsWith('.png');
}

app.get('/cop', function (req, res) {
    var icons = [];
    var shapes = [];
    var links = [];
    if (req.session.loggedin) {
        if (req.query.mission !== undefined && req.query.mission && objectid.isValid(req.query.mission)) {
            try {
                if (req.session.username === 'admin' || req.session.is_admin) {
                    mdb.collection('missions').aggregate([{
                        $match: {
                            _id: objectid(req.query.mission),
                            deleted: {
                                $ne: true
                            }
                        }
                    }]).toArray(function (err, row) {
                        if (row && row.length > 0) {
                            fs.readdir('./public/images/icons', function (err, icons) {
                                fs.readdir('./public/images/shapes', function (err, shapes) {
                                    fs.readdir('./public/images/links', function (err, links) {
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
                                            username: req.session.username,
                                            icons: icons.filter(getPNGs),
                                            shapes: shapes.filter(getPNGs),
                                            links: links.filter(getPNGs)
                                        });
                                    });
                                });
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
                            fs.readdir('./public/images/icons', function (err, icons) {
                                fs.readdir('./public/images/shapes', function (err, shapes) {
                                    fs.readdir('./public/images/links', function (err, links) {
                                        var mission_name = row[0].name;
                                        req.session.mission_permissions[req.query.mission] = row[0].permissions;

                                        if (req.session.mission_permissions[req.query.mission]) { // always let admin in
                                            res.render('cop', {
                                                title: 'cop - ' + mission_name,
                                                permissions: JSON.stringify(req.session.mission_permissions[req.query.mission]),
                                                mission_name: mission_name,
                                                user_id: req.session.user_id,
                                                username: req.session.username,
                                                icons: icons.filter(getPNGs),
                                                shapes: shapes.filter(getPNGs),
                                                links: links.filter(getPNGs)
                                            });
                                        }
                                        else {
                                            res.redirect('login');
                                        }
                                    });
                                });
                            });
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
app.use('/download', express.static(path.join(__dirname, 'mission_files'), {
    etag: false,
    setHeaders: function (res, path) {
        res.attachment(path);
    }

}))

app.post('/upload', upload.any(), function (req, res) {
    if (!req.session.loggedin || !req.session.mission_permissions[req.body.mission_id].write_access) {
        res.status(500).send('Error: Permission denied or invalid data.');
        return;
    }
    if (req.body.dir && req.body.mission_id) {
        var dir = path.normalize(req.body.dir).replace(/^(\.\.[\/\\])+/, '');
        var base = path.join(__dirname + '/mission_files/mission-' + req.body.mission_id + '/');
        var fullpath = path.join(base, dir);

        // make sure target dir exists and get inode
        fs.stat(fullpath, function (err, dirstat) {
            if (err) {
                res.status(500).send('Error: Permission denied or invalid data.');
                logger.error(err);
                return;
            }
            async.each(req.files, function (file, callback) {
                // check if a file is already there
                fs.stat(fullpath + '/' + file.originalname, function (err, s) {
                    if (!err) {
                        sendToRoom(req.body.mission_id, JSON.stringify({
                            act: 'delete_file',
                            arg: s.ino
                        }));
                    }
                    // move temp file to final path
                    fs.rename(file.path, fullpath + '/' + file.originalname, function (err) {
                        if (err) {
                            res.status(500).send('Error: File upload error.');
                            logger.error(err);
                        } else {
                            callback(file);
                        }
                    });
                });
            }, function (file) {
                // grab inode of uploaded file and send to sockets
                fs.stat(fullpath + '/' + file.originalname, function (err, s) {
                    if (err) {
                        res.status(500).send('Error: Permission denied or invalid data.');
                    } else {
                        var parent = dirstat.ino;
                        if (req.body.dir === '/') {
                            parent = '.';
                        }
                        res.send('{}');
                        sendToRoom(req.body.mission_id, JSON.stringify({
                            act: 'insert_file',
                            arg: {
                                _id: s.ino,
                                name: file.originalname,
                                type: 'file',
                                parent: parent
                            }
                        }));
                    }
                });
            });
        });
    } else {
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

// -------------------------------------------------------------------------

http.listen(3000, function () {
    logger.info('Server listening on port 3000!');
});