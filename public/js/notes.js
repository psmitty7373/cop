function addNotes(notes) {
    for (var i = 0; i < notes.length; i++) {
        var node = { id: notes[i]._id, text: notes[i].name, icon: 'jstree-file', type: notes[i].type, li_attr: { isLeaf: true } };
        var parent = 'notes';
        if (notes[i].type === 'object') {
            parent = 'objects';
        }
        $('#notes').jstree().create_node(parent, node);
    }
}

$(window).on('load', function () {
    $('#notes')
        .on('select_node.jstree', function (e, data) {
            var name = '';
            if (data.node && data.node.text)
                name = data.node.text;
            if (data.node.li_attr.isLeaf) {
                editDetails(data.selected[0], name);
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
            'plugins': ['wholerow', 'contextmenu'],
            'contextmenu': {
                'select_node': false,
                'items': function (node) {
                    if (!node.li_attr.isLeaf) {
                        if (node.id === 'notes') {
                            return { renamenote: {
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
                                editDetails(node.id, node.text);
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
                                    socket.send(JSON.stringify({
                                        act: 'delete_note',
                                        arg: {
                                            _id: node.id
                                        },
                                        msgId: msgHandler()
                                    }));
                                }
                            };
                        }
                        return menu;
                    }
                }
            }
        });
});