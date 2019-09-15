var f = function(e)
{
    var srcElement = e.srcElement? e.srcElement : e.target;
    if (e.type === 'dragleave' && $(srcElement).hasClass('jstree-wholerow-hovered')) {
        $(srcElement).removeClass('jstree-wholerow-hovered');
    }
    if ($.inArray('Files', e.dataTransfer.types) > -1)
    {
        e.stopPropagation();
        e.preventDefault();
        e.dataTransfer.dropEffect = ($(srcElement).hasClass('droppable')) ? 'copy' : 'none';
        if (e.dataTransfer.dropEffect === 'copy' && e.type !== 'dragleave')
            $(srcElement).addClass('jstree-wholerow-hovered');
        if (e.type == 'drop') {
            var formData = new FormData();
            formData.append('dir', srcElement.id);
            $.each(e.dataTransfer.files, function(i, file) {
                formData.append('file',file);
            });
            formData.append('mission_id', mission_id);
            $.ajax({
                url: 'upload',
                type: 'POST',
                xhr: function() {
                    var mxhr = $.ajaxSettings.xhr();
                    if (mxhr.upload) {
                        $("#progressbar")
                            .progressbar({ value: 0 })
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
                success: function() {
                    $("#progressbar").progressbar('value', 100).children('.ui-progressbar-value').html('Upload successful!');
                    setTimeout(function() {
                        $("#progressbar").fadeOut("slow");
                    }, 5000);
                },
                error: function() {
                    $("#progressbar").progressbar('value', 100).children('.ui-progressbar-value').html('Upload error!');
                    console.log('upload error');
                }
            });
        }
    }
};

function progressHandler(e) {
    if (e.lengthComputable) {
        var p = Math.floor((e.loaded/e.total)*100);
        $("#progressbar").progressbar('value', p).children('.ui-progressbar-value').html(p.toPrecision(3) + '%');

    }
}

$(document).ready(function() {
    document.body.addEventListener('dragleave', f, false);
    document.body.addEventListener('dragover', f, false);
    document.body.addEventListener('drop', f, false);
    $('#files')
        .on('select_node.jstree', function(e, data) {
            if (data.node.li_attr.isLeaf) {
                var o = 'download/mission-' + mission_id + '/' + data.selected[0];
                var dl = $('<iframe />').attr('src', o).hide().appendTo('body');
            }
        }).jstree({
            'core': {
                'check_callback': true,
                'data': {
                    'method': 'POST',
                    'url': function(node) {
                        return 'dir/';
                    },
                    'data': function(node) {
                        return {
                            id: node.id,
                            mission_id: mission_id
                        };
                    }
                }
            },
            'plugins': ['dnd', 'wholerow', 'contextmenu'],
            'contextmenu': {
                'select_node' : false,
                'items': function(node) {
                    return {
                        'mkdir': {
                            'separator_before': false,
                            'separator_after': false,
                            'label': 'mkdir',
                            'action': function (obj) {
                                var _node = node;
                                bootbox.prompt('Directory name?', function(name) {
                                    $.ajax({
                                        url: 'mkdir',
                                        type: 'POST',
                                        data: {'id': _node.id, 'name': name, 'mission_id': mission_id},
                                        success: function() {
                                        },
                                        error: function() {
                                            console.log('mkdir error');
                                        }
                                    });
                                });
                            }
                        },
                        'del': {
                            'separator_before': false,
                            'separator_after': false,
                            'label': 'del',
                            'action': function (obj) {
                                $.ajax({
                                    url: 'delete',
                                    type: 'POST',
                                    data: {'id': node.id, 'mission_id': mission_id},
                                    success: function() {
                                    },
                                    error: function() {
                                        console.log('delete error');
                                    }
                                });
                            }
                        }
                    }
                }
            }
        });
    $(document).on('dnd_stop.vakata', function(e, data) {
        var t = $(data.event.target);
        var targetnode = t.closest('.jstree-node');
        var dst = targetnode.attr("id");
        var src = data.data.nodes[0];
        $.ajax({
            url: 'mv',
            type: 'POST',
            data: {'dst': dst, 'src': src},
            success: function() {
            },
            error: function() {
                console.log('mv error');
            }
        });
    });
});

