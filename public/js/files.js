function filesUpload(evt, id) {
    var formData = new FormData();
    formData.append('parent_id', id);

    $.each(evt.originalEvent.dataTransfer.files, function (i, file) {
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

var filesDragAndDrop = function (evt) {    
    var srcElement = evt.originalEvent.srcElement ? evt.originalEvent.srcElement : evt.originalEvent.target;

    if (evt.originalEvent.type === 'dragleave' && $(srcElement).hasClass('jstree-wholerow-hovered')) {
        $(srcElement).removeClass('jstree-wholerow-hovered');
    }

    if ($.inArray('Files', evt.originalEvent.dataTransfer.types) > -1) {
        evt.originalEvent.stopPropagation();
        evt.originalEvent.preventDefault();
        evt.originalEvent.dataTransfer.dropEffect = ($(srcElement).hasClass('droppable')) ? 'copy' : 'none';
        if (evt.originalEvent.dataTransfer.dropEffect === 'copy' && evt.originalEvent.type !== 'dragleave') {
            $(srcElement).addClass('jstree-wholerow-hovered');
        }

        evt.originalEvent.dataTransfer.types

        if (evt.originalEvent.type == 'drop') {
            var node = $('#files').jstree().get_node(srcElement.id.split('_')[0]);
            if (node) {
                filesUpload(evt, node.id);
            }            
        }
    }
};

function progressHandler(evt) {
    if (evt.lengthComputable) {
        var p = Math.floor((evt.loaded / evt.total) * 100);
        $("#progressbar").progressbar('value', p).children('.ui-progressbar-value').html(p.toPrecision(3) + '%');

    }
}

function addFiles(files) {
    for (var i = 0; i < files.length; i++) {
        var node = { id: files[i]._id, text: files[i].name, icon: 'jstree-file', state: { opened: true }, type: files[i].type, li_attr: { isLeaf: true }, data: { protected: files[i].protected }};

        if (files[i].type === 'dir') {
            node.icon = 'jstree-folder';
            node.li_attr.isLeaf = false;
            node.a_attr = { class: 'droppable' };
        }
        $('#files').jstree().create_node(files[i].parent_id, node);
    }
}

function filesNewDirectory(node) {
    var msg = `
<form>
    <div class="form-group row">
        <label for="ndName" class="col-sm-4 col-form-label">Directory Name:</label>
        <div class="col-sm-8">
            <input type="text" class="form-control" id="ndName">
        </div>
    </div>
</form>`;

    bootbox.dialog({
        message: msg,
        title: 'New Directory',
        buttons: {
            confirm: {
                label: 'Create',
                className: 'btn-primary',
                callback: function () {
                    var name = $('#ndName').val();
                    socket.send(JSON.stringify({
                        act: 'insert_file',
                        arg: {
                            parent_id: node.id,
                            name: name,
                            type: 'dir'
                        },
                        msgId: msgHandler()
                    }));
                }
            },
            cancel: {
                label: 'Cancel',
                className: 'btn-danger'
            }
        }
    });
}

$(window).on('load', function () {
    $('#files').on('dragover', filesDragAndDrop);
    $('#files').on('dragleave', filesDragAndDrop);
    $('#files').on('drop', filesDragAndDrop);

    $('#files')
        .on('select_node.jstree', function (e, data) {
            if (data.node.li_attr.isLeaf) {
                var url = 'download?file_id=' + data.node.id + '&mission_id=' + mission_id; 
                var dl = $('<iframe />').attr('src', url).hide().appendTo('body');
            }

        }).jstree({
            'core': {
                'check_callback' : function(o, n, p, i, m) {
                    if(m && m.dnd && m.pos !== 'i') { return false; }
                    if(o === "move_node" || o === "copy_node") {
                        if(this.get_node(n).parent === this.get_node(p).id) { return false; }
                    }
                    return true;
                },
                'themes': {
                    'dots': true
                },
                'data': []
            },
            'plugins': ['dnd', 'wholerow', 'contextmenu'],
            'dnd': {
                'is_draggable': function(node) {
                    return !node[0].data.protected;
                },
                'drag_check': function(node) {
                    console.log(node);
                    return {
                        after: false,
                        before: false,
                        inside: true
                    }
                }
            },
            'contextmenu': {
                'select_node': false,
                'items': function (node) {
                    var menu = {};
 
                    if (node.li_attr.isLeaf) {
                        menu.copyUrl = {
                            'separator_before': false,
                            'separator_after': false,
                            'label': 'Copy URL',
                            'action': function (obj) {
                                var url = window.location.origin + '/download?file_id=' + node.id + '&mission_id=' + mission_id;
                                copyText(url);
                            }
                        }
                    }

                    if (permissions.write_access && node.data.protected === false) {
                        menu.rename = {
                            'separator_before': false,
                            'separator_after': false,
                            'label': 'Rename',
                            'action': function (obj) {
                                bootbox.prompt('Rename to?', function (name) {
                                    if (name !== null) {
                                        socket.send(JSON.stringify({
                                            act: 'update_file',
                                            arg: {
                                                _id: node.id,
                                                parent_id: node.parent,
                                                name: name
                                            },
                                            msgId: msgHandler()
                                        }));
                                    }
                                });
                            }
                        };
                    }

                    if (permissions.delete_access && node.data.protected === false) {
                        menu.del = {
                            'separator_before': false,
                            'separator_after': false,
                            'label': 'Delete',
                            'action': function (obj) {
                                deleteConfirm('filesDelete(\'' + node.id + '\')');
                            }
                        };
                    }
                
                    if (permissions.write_access && !node.li_attr.isLeaf) {
                        menu.mkdir = {
                            'separator_before': false,
                            'separator_after': false,
                            'label': 'New Folder',
                            'action': function (obj) {
                                filesNewDirectory(node);
                            }
                        }
                    }
                return menu;
                }
            }
        });

    $('#files').on("move_node.jstree", function (e, data) {
        socket.send(JSON.stringify({
            act: 'update_file',
            arg: {
                _id: data.node.id,
                parent_id: data.parent,
                name: data.node.text                
            },
            msgId: msgHandler()
        }));
    });
});

function filesDelete(id) {
    socket.send(JSON.stringify({
        act: 'delete_file',
        arg: {
            _id: id
        },
        msgId: msgHandler()
    }));
}