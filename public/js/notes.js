var colors = {};

function notesAdd(notes) {
    for (var i = 0; i < notes.length; i++) {
        var node = { id: notes[i]._id, text: notes[i].name, icon: 'jstree-file', type: notes[i].type, li_attr: { isLeaf: true } };
        var parent = 'notes';
        if (notes[i].type === 'object') {
            parent = 'objects';
        }
        $('#notes').jstree().create_node(parent, node);
    }
    $('#notes').jstree()
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
                    var w = windowManager.createWindow({
                        sticky: false,
                        title: name,
                        effect: 'none',
                        bodyContent: '<div id="object_details_' + id + '" class="object-details" style="resize: none;"></div>',
                        closeCallback: function () {
                            openDocs[id].localPresence.destroy();
                            //openDocs[id].presence.destroy();
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
                    openDocs[id].quill = new Quill('#object_details_' + id, {
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

                    openDocs[id].presence = openDocs[id].doc.connection.getDocPresence('sharedb', id);
                    openDocs[id].presence.subscribe(function(err) {
                        if(err) throw err;
                    });
                    var cid  = ObjectId().toString();
                    openDocs[id].localPresence = openDocs[id].presence.create(cid);

                    openDocs[id].doc.on('op', function (op, source) {
                        if (source === openDocs[id].quill) return;
                        openDocs[id].quill.updateContents(op);
                    });
                    
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
                        colors[rid] = colors[rid] || '#'+Math.floor(Math.random()*16777215).toString(16);                        ;
                        var name = (range && range.name) || 'Anonymous';
                        openDocs[id].cursors.createCursor(id, name, colors[rid]);
                        openDocs[id].cursors.moveCursor(id, range);
                    });

                    $('#object_details_' + id).overlayScrollbars({
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
                        bodyContent: '<textarea id="object_details_' + id + '" class="object-details" style="resize: none; height: 100%"' + disabled + '></textarea>',
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

$(window).on('load', function () {
    $('#notes')
        .on('select_node.jstree', function (e, data) {
            var name = '';
            if (data.node && data.node.text)
                name = data.node.text;
            if (data.node.li_attr.isLeaf) {
                notesEdit(data.selected[0], name);
            }
        }).jstree({
            'core': {
                'check_callback': true,
                'data': [{
                    id: "/",
                    text: "/",
                    icon: "jstree-folder",
                    state: {
                        opened: true,
                        disabled: false,
                        selected: false
                    },
                    li_attr: {
                        base: "#",
                        isLeaf: false
                    },
                    children : [{
                        id: "notes",
                        text: "notes",
                        icon: "jstree-folder",
                        state: {
                            opened: true,
                            disabled: false,
                            selected: false
                        },
                        li_attr: {
                            base: "/",
                            isLeaf: false
                        },
                        children : []
                    },{
                        id: "objects",
                        text: "objects",
                        icon: "jstree-folder",
                        state: {
                            opened: true,
                            disabled: false,
                            selected: false
                        },
                        li_attr: {
                            base: "/",
                            isLeaf: false
                        },
                        children : []
                    }]
                }]
            },
            'plugins': ['wholerow', 'contextmenu', 'sort'],
            'contextmenu': {
                'select_node': false,
                'items': function (node) {
                    if (!node.li_attr.isLeaf) {
                        if (permissions.write_access && node.id === 'notes' ) {
                            return { newnote: {
                                'separator_before': false,
                                'separator_after': false,
                                'label': 'New Note',
                                'action': function (obj) {
                                    var _node = node;
                                    bootbox.prompt('Note name?', function (name) {
                                        if (name !== null) {
                                            socket.send(JSON.stringify({
                                                act: 'insert_note',
                                                arg: {
                                                    name: name
                                                },
                                                msgId: msgHandler()
                                            }));
                                        }
                                    });
                                }
                            }};
                        }
                        return {};
                    }
                    else {
                        var menu = { 'open': {
                            'separator_before': false,
                            'separator_after': false,
                            'label': 'Open',
                            'action': function (obj) {
                                var _node = node;
                                notesEdit(node.id, node.text);
                            }
                        }};

                        if (permissions.write_access && node.parent === 'notes') {
                            menu.renamenote = {
                                'separator_before': false,
                                'separator_after': false,
                                'label': 'Rename',
                                'action': function (obj) {
                                    var _node = node;
                                    bootbox.prompt('Rename note to?', function (name) {
                                        if (name !== null) {
                                            socket.send(JSON.stringify({
                                                act: 'update_note',
                                                arg: {
                                                    _id: node.id,
                                                    name: name
                                                },
                                                msgId: msgHandler()
                                            }));
                                        }
                                    });
                                }
                            };
                        }
                        
                        if (permissions.delete_access && node.parent === 'notes') {
                            menu.del = {
                                'separator_before': false,
                                'separator_after': false,
                                'label': 'Delete Note',
                                'action': function (obj) {
                                    deleteConfirm('notesDelete(\'' + node.id + '\')');
                                }
                            };
                        }
                        return menu;
                    }
                }
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