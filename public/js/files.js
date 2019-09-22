var filesDragAndDrop = function (e) {
    
    var srcElement = e.originalEvent.srcElement ? e.originalEvent.srcElement : e.originalEvent.target;

    if (e.originalEvent.type === 'dragleave' && $(srcElement).hasClass('jstree-wholerow-hovered')) {
        $(srcElement).removeClass('jstree-wholerow-hovered');
    }

    if ($.inArray('Files', e.originalEvent.dataTransfer.types) > -1) {
        e.originalEvent.stopPropagation();
        e.originalEvent.preventDefault();
        e.originalEvent.dataTransfer.dropEffect = ($(srcElement).hasClass('droppable')) ? 'copy' : 'none';
        if (e.originalEvent.dataTransfer.dropEffect === 'copy' && e.originalEvent.type !== 'dragleave') {
            $(srcElement).addClass('jstree-wholerow-hovered');
        }

        e.originalEvent.dataTransfer.types

        if (e.originalEvent.type == 'drop') {
            var node = $('#files').jstree().get_node(srcElement.id.split('_')[0]);
            if (node) {
                var formData = new FormData();
                formData.append('dir', $('#files').jstree().get_path(node).join('/').replace('//',''));

                $.each(e.originalEvent.dataTransfer.files, function (i, file) {
                    formData.append('file', file);
                });

                formData.append('mission_id', mission_id);

                $.ajax({
                    url: 'upload',
                    type: 'POST',
                    xhr: function () {
                        var mxhr = $.ajaxSettings.xhr();
                        if (mxhr.upload) {
                            $("#progressbar")
                                .progressbar({
                                    value: 0
                                })
                                .children('.ui-progressbar-value')
                                .html('0%')
                                .css("display", "block");
                            mxhr.upload.addEventListener('progress', progressHandler, false);
                        }
                        return mxhr;
                    },
                    data: formData,
                    dataType: 'json',
                    cache: false,
                    contentType: false,
                    processData: false,
                    success: function () {
                        $("#progressbar").progressbar('value', 100).children('.ui-progressbar-value').html('Upload successful!');
                        setTimeout(function () {
                            $("#progressbar").fadeOut("slow");
                        }, 5000);
                    },
                    error: function () {
                        $("#progressbar").progressbar('value', 100).children('.ui-progressbar-value').html('Upload error!');
                        console.log('upload error');
                    }
                });
            }
        }
    }
};

function progressHandler(e) {
    if (e.lengthComputable) {
        var p = Math.floor((e.loaded / e.total) * 100);
        $("#progressbar").progressbar('value', p).children('.ui-progressbar-value').html(p.toPrecision(3) + '%');

    }
}

function addFiles(files) {
    for (var i = 0; i < files.length; i++) {
        var node = { id: files[i]._id, text: files[i].name, icon: 'jstree-file', type: files[i].type, li_attr: { isLeaf: true } };

        if (files[i].type === 'dir') {
            node.icon = 'jstree-folder';
            node.li_attr.isLeaf = false;
            node.a_attr = { class: 'droppable' };
        }
        $('#files').jstree().create_node(files[i].parent, node);
    }
}

$(document).ready(function () {
    $('#files').on('dragover', filesDragAndDrop);
    $('#files').on('dragleave', filesDragAndDrop);
    $('#files').on('drop', filesDragAndDrop);

    $('#files')
        .on('select_node.jstree', function (e, data) {
            if (data.node.li_attr.isLeaf) {
                var url = 'download/mission-' + mission_id + '/' + $('#files').jstree().get_path(data.node).join('/').replace('//','');
                var dl = $('<iframe />').attr('src', url).hide().appendTo('body');
            }

        }).jstree({
            'core': {
                'check_callback': true,
                'themes': {
                    'dots': true
                },
                'data': [{
                    id: '.',
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
                    a_attr: {
                        class: 'droppable'
                    },
                    children : []
                }]
            },
            'plugins': ['dnd', 'wholerow', 'contextmenu'],
            'contextmenu': {
                'select_node': false,
                'items': function (node) {
                    var menu = {
                        'rename': {
                            'separator_before': false,
                            'separator_after': false,
                            'label': 'Rename',
                            'action': function (obj) {
                                var _node = node;
                                bootbox.prompt('Rename to?', function (name) {
                                    socket.send(JSON.stringify({
                                        act: 'move_file',
                                        arg: {
                                            src: $('#files').jstree().get_path(node.id).join('/').replace('//',''),
                                            dst: ($('#files').jstree().get_path(node.id).slice(0,-1).join('/') + '/' + name).replace('//','')
                                        },
                                        msgId: msgHandler()
                                    }));
                                });
                            }
                        },
                        'del' : {
                            'separator_before': false,
                            'separator_after': false,
                            'label': 'Delete',
                            'action': function (obj) {
                                socket.send(JSON.stringify({
                                    act: 'delete_file',
                                    arg: {
                                        file: $('#files').jstree().get_path(node.id).join('/').replace('//','')
                                    },
                                    msgId: msgHandler()
                                }));
                            }
                        }
                    }
                    if (!node.li_attr.isLeaf) {
                        menu.mkdir = {
                            'separator_before': false,
                            'separator_after': false,
                            'label': 'New Folder',
                            'action': function (obj) {
                                var _node = node;
                                bootbox.prompt('Directory name?', function (name) {
                                    socket.send(JSON.stringify({
                                        act: 'insert_file',
                                        arg: {
                                            dst: $('#files').jstree().get_path(node.id).join('/').replace('//',''),
                                            name: name
                                        },
                                        msgId: msgHandler()
                                    }));
                                });
                            }
                        }
                    }
                return menu;
                }
            }
        });

    $('#files').on("move_node.jstree", function (e, data) {
        socket.send(JSON.stringify({
            act: 'move_file',
            arg: {
                src: $('#files').jstree().get_path(data.old_parent).join('/').replace('//','') + '/' + data.node.text,
                dst: $('#files').jstree().get_path(data.node.id).join('/').replace('//','')
            },
            msgId: msgHandler()
        }));
    });
});