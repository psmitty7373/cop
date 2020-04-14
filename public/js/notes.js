var colors = {};
var notesTabulator;
var openDocs = {};
var shareDBConnection;

function notesInsertPresence(id, user_id, username) {
    var window = windowManager.findWindowByID(id);
    if (window) {
        if (window.getElement().find('[data-user_id="' + user_id + '"]').length == 0) {
            var elem = window.getElement().find('.modal-footer').append('<a href="#" data-user_id="' + user_id + '" data-sort="' + username + '" data-toggle="tooltip" data-placement="top" title="' + username + '"><img class="presenceAvatar" src="images/avatars/' + user_id + '.png" data-toggle="tooltip" data-placement="bottom"></a>');
            elem.fadeIn('fast');
        }
    }
}

function notesDeletePresence(id, user_id) {
    var window = windowManager.findWindowByID(id);
    if (window) {
        var elem = window.getElement().find('[data-user_id="' + user_id + '"]');
        console.log(elem);
        if (elem.length > 0) {
            elem.fadeOut('fast', function() { $(this).remove() });
        }
    }
}

function notesEdit(id, name) {
    var rw = false;
    if (!name) {
        name = '';
    }
    if (!id) {
        if (permissions.write_access) {
            rw = true;
        }
    } else {
        if (permissions.write_access)
            rw = true;
    }

    if (id) {
        if (name == '') {
            name = "Note Editor";
        }
        $('#modal-title').text(name);
        $('#modal-footer').html('<button type="button btn-primary" class="button btn btn-default" data-dismiss="modal">Close</button>');
        $('#modal-content').addClass('modal-details');
        if (!openDocs[id]) {
            openDocs[id] = {};
            openDocs[id].doc = shareDBConnection.get('sharedb', id);
            openDocs[id].doc.subscribe(function (err) {
                if (err) throw err;

                if (openDocs[id].doc.type === null) {
                    openDocs[id].doc.create('', 'rich-text');
                }                

                if (openDocs[id].doc.type.name === 'rich-text') {
                    // create window
                    var presenceImgs = '';
                    if (presence[id]) {
                        var presenceUsers = Object.keys(presence[id]);
                        for (var i = 0; i < presenceUsers.length; i++) {
                            if (presenceUsers[i] != user_id && presence[id][presenceUsers[i]]) {
                                presenceImgs += '<a href="#" data-user_id="' + presenceUsers[i] + '" data-sort="' + presence[id][presenceUsers[i]].username + '" data-toggle="tooltip" data-placement="top" title="' + presence[id][presenceUsers[i]].username + '"><img class="presenceAvatar" src="images/avatars/' + presenceUsers[i] + '.png" data-toggle="tooltip" data-placement="bottom"></a>';
                            }
                        }
                    }
                    var w = windowManager.createWindow({
                        sticky: false,
                        title: name,
                        effect: 'none',
                        id: id,
                        bodyContent: '<div id="notes_' + id + '" class="object-details" style="resize: none;"></div>',
                        footerContent: presenceImgs,
                        closeCallback: function () {
                            openDocs[id].presence.destroy();                   
                            openDocs[id].doc.destroy();
                            delete openDocs[id].cursors;
                            delete openDocs[id].quill;
                            delete openDocs[id];
                        }
                    });

                    // make dragable
                    w.$el.draggable({
                        handle: '.modal-header'
                    }).children('.window-content').resizable({
                        minHeight: 153,
                        minWidth: 300
                    });

                    // start quill
                    openDocs[id].quill = new Quill('#notes_' + id, {
                        theme: 'snow',
                        readOnly: !rw,
                        modules: {
                            cursors: true,
                            syntax: true,
                            toolbar: [
                                [{
                                    header: [1, 2, false]
                                }],
                                ['bold', 'italic', 'underline'],
                                ['link', 'image', 'code-block']
                            ]
                        }
                    });

                    openDocs[id].cursors = openDocs[id].quill.getModule('cursors');

                    openDocs[id].quill.root.setAttribute('spellcheck', false)

                    openDocs[id].quill.setContents(openDocs[id].doc.data);

                    openDocs[id].quill.on('text-change', function (delta, oldDelta, source) {
                        if (source !== 'user') return;
                        openDocs[id].doc.submitOp(delta, {
                            source: openDocs[id].quill
                        });
                    });

                    openDocs[id].doc.on('op', function (op, source) {
                        if (source === openDocs[id].quill) return;
                        openDocs[id].quill.updateContents(op);
                    });

                    openDocs[id].doc.on('error', function(err) {
                        console.log(err);
                    });

                    openDocs[id].presence = openDocs[id].doc.connection.getDocPresence('sharedb', id);
                    openDocs[id].presence.subscribe(function(err) {
                        if(err) throw err;
                    });
                    var cid  = ObjectId().toString();
                    openDocs[id].localPresence = openDocs[id].presence.create(cid);

                    openDocs[id].quill.on('selection-change', function(range) {
                        // Ignore blurring, so that we can see lots of users in the
                        // same window. In real use, you may want to clear the cursor.
                        if (!range) return;
                        // In this particular instance, we can send extra information
                        // on the presence object. This ability will vary depending on
                        // type.
                        range.name = username;
                        openDocs[id].localPresence.submit(range, function(err) {
                            if (err) throw err;
                        });
                    });

                    openDocs[id].presence.on('receive', function(rid, range) {
                        if (!openDocs[id]) {
                            console.log('here');
                            return;
                        }
                        colors[rid] = colors[rid] || '#'+Math.floor(Math.random()*16777215).toString(16);                        ;
                        var name = (range && range.name) || 'Anonymous';
                        openDocs[id].cursors.createCursor(id, name, colors[rid]);
                        openDocs[id].cursors.moveCursor(id, range);
                    });

                    $('#notes_' + id).overlayScrollbars({
                        className: "os-theme-dark"
                    });

                } else {
                    var disabled = ' disabled';
                    if (permissions.write_access) {
                        disabled = '';
                    }

                    // create window
                    var w = windowManager.createWindow({
                        sticky: false,
                        title: name,
                        effect: 'none',
                        bodyContent: '<textarea id="notes_' + id + '" class="object-details" style="resize: none; height: 100%"' + disabled + '></textarea>',
                        closeCallback: function () {
                            openDocs[id].localPresence.destroy();
                            //openDocs[id].presence.destroy();
                            openDocs[id].doc.destroy();
                            delete openDocs[id].cursors;
                            delete openDocs[id].quill;
                            delete openDocs[id];
                        }
                    });

                    // set scrollbars
                    w.$el.children('.object-details').overlayScrollbars({
                        className: "os-theme-dark"
                    });

                    // make dragable
                    w.$el.draggable({
                        handle: '.modal-header'
                    }).children('.window-content').resizable({
                        minHeight: 153,
                        minWidth: 300
                    });
                }
            });
        } else
            console.log('document already open');
    }
}

function dateMutator(value, data, type, params, component) {
    return epochToDateString(value);
}


$(window).on('load', function () {
    notesTabulator = new Tabulator("#notesTable", {
        layout: "fitColumns",
        index: '_id',
        selectable: 'highlight',
        columns: [{
                title: '_id',
                field: '_id',
                visible: false
            },
            {
                title: 'Name',
                field: 'name',
                sorter: 'alphanum'
            },
            {
                title: 'Modified',
                field: 'mtime',
                mutator: dateMutator
            }
        ],
        rowClick: function(e, row) {
            notesEdit(row.getData()._id, row.getData().name);
        }
    });
});

function notesDelete(id) {
    socket.send(JSON.stringify({
        act: 'delete_note',
        arg: {
            _id: id
        },
        msgId: msgHandler()
    }));
}

$(window).on('load', function () {
    Quill.register('modules/cursors', QuillCursors);
});