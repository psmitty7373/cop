// ---------------------------- NOTES TREE ----------------------------------
function createNotesTree(arg) {
    $('#notes')
        .on('select_node.jstree', function(e, data) {
            var name = '';
            if (data.node && data.node.text)
                name = data.node.text;
            if (data.node.li_attr.isLeaf) {
                editDetails('m-' + mission_id + '-n-' + data.selected[0], name);
            }
        }).jstree({
            'core': {
                'check_callback': true,
                'data': arg
            },
            'plugins': ['dnd', 'wholerow', 'contextmenu'],
            'contextmenu': {
                'select_node' : false,
                'items': function(node) {
                    return {
                        'newnote': {
                            'separator_before': false,
                            'separator_after': false,
                            'label': 'New Note',
                            'action': function (obj) {
                                var _node = node;
                                bootbox.prompt('Note name?', function(name) {
                                    socket.send(JSON.stringify({act: 'insert_note', arg: {name: name}, msgId: msgHandler()}));
                                });
                            }
                        },
                        'renamenote': {
                            'separator_before': false,
                            'separator_after': false,
                            'label': 'Rename',
                            'action': function (obj) {
                                var _node = node;
                                bootbox.prompt('Rename note to?', function(name) {
                                    socket.send(JSON.stringify({act: 'rename_note', arg: {id: node.id, name: name}, msgId: msgHandler()}));
                                });
                            }
                        },
                        'del': {
                            'separator_before': false,
                            'separator_after': false,
                            'label': 'Delete Note',
                            'action': function (obj) {
                                socket.send(JSON.stringify({act: 'delete_note', arg: {id: node.id}, msgId: msgHandler()}));
                            }
                        }
                    }
                }
            }
        });
}
