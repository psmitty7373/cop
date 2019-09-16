const bcrypt = require('bcrypt');
const crypto = require('crypto');
const MongoClient = require('mongodb').MongoClient;
var mc;
var mdb;

(async function() {
    try {
        mc = await MongoClient.connect('mongodb://localhost/ctfcop', {
            useNewUrlParser: true,
            useUnifiedTopology: true
        });
        mdb = mc.db('ctfcop')
        if (await set_user_unique())
            await create_user();
        process.exit();
    } catch (err) {
        throw(err);
    }
})();

async function set_user_unique() {
    try { 
        await mdb.collection('users').createIndex({ username: 1 }, { unique: true });
        return true;
    } catch (err) {
        if (err.codeName != 'DuplicateKey') {
            console.log(err);
            return false;
        }
    }
    return true;
}

async function create_user() {
    if (process.argv.length === 3) {
        var hash;
        try {
            hash = await bcrypt.hash(process.argv[2], 10);
            var api = crypto.randomBytes(32).toString('hex');
            var user = { username: 'admin', name: 'admin', password: hash, permissions: { manage_users: true, manage_missions: true}, api: api, avatar: '', deleted: false };
            var row = await mdb.collection('users').findOne({ username: 'admin' });
            if (!row) {
                await mdb.collection('users').insertOne(user);
            } else {
                await mdb.collection('users').updateOne({ _id: row._id }, { $set: user });
            }
        } catch (err) {
            console.log(err);
            return false;
        }
        return true;
    } else {
        return true;
    }
}
