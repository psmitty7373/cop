// ---------------------------- Toolbar Stuff  ----------------------------------
var activeSubToolbar = null;
var activeToolbar = null;
var activeTable = 'chat';
var toolbarState = false;

function toggleToolbar(toolbar) {
    if (toolbar === null) {
        toggleToolbar('tools');
        return;
    }

    if ($('#toolbarBody').width() === 0) {
        openToolbar(toolbar);
    } else {
        if (activeToolbar === toolbar)
            closeToolbar();
        else
            openToolbar(toolbar);
    }
}

function toolbarEditObject() {
    if (activeSubToolbar === 'editObject')
        return;

    if (canvas.getActiveObjects().length > 1) {
        $("#toolbarBody").addClass("disabledDiv");
    } else {
        $("#toolbarBody").removeClass("disabledDiv");
    }

    if (permissions.modify_diagram) {
        $('#toolbarTitle').html('Edit Object');
    } else {
        $('#toolbarTitle').text('View Object');
    }

    $('#propNameGroup').show();
    $('#propObjectGroup').show();
    $('#editDetailsButton').show();
    $('#deleteObjectButton').show();
    $('#insertObjectButton').hide();
    $('#newObjectButton').show();
    $('#propObjectGroup').tabs('disable');

    var objType = $('#propType').val();

    if (objType === 'link') {
        $('#sizeObject').hide();
        $('#lockObjectGroup').hide();
        $('#propFillColorSpan').hide();
    } else {
        $('#sizeObject').show();
        $('#lockObjectGroup').show();
    }

    var index = $('#propObjectGroup a[href="#tabs-' + objType + '"]').parent().index();
    $('#moveObject').show();
    $('#propObjectGroup').tabs('enable', index);
    $('#propObjectGroup').tabs('option', 'active', index);

    activeSubToolbar = 'editObject';
}

function toolbarNewObject() {
    if (activeSubToolbar === 'newObject')
        return;

    $("#toolbarBody").removeClass("disabledDiv");
    $('#toolbarTitle').html('New Object');
    $('#propID').val('');
    $('#propNameGroup').show();
    $('#propName').val('');
    $('#propFillColor').val(lastFillColor);
    $('#propFillColor').data('paletteColorPickerPlugin').reload();
    $('#propStrokeColor').val(lastStrokeColor);
    $('#propStrokeColor').data('paletteColorPickerPlugin').reload();
    $('#lockObject').prop('checked', false);
    $('#propType').val('icon');
    $('#prop-icon').val('00-000-icon-hub.png');
    $('#prop-icon').data('picker').sync_picker_with_select();
    $('#propObjectGroup').tabs('enable');
    $('#propObjectGroup').tabs('option', 'active', 0);
    $('#moveObject').hide();
    $('#newObjectButton').hide();
    $('#editDetailsButton').hide();
    $('#deleteObjectButton').hide();
    $('#insertObjectButton').show();

    activeSubToolbar = 'newObject';
}

function openToolbar(toolbar) {
    if (toolbarState && toolbar == activeToolbar) {
        return;
    }

    $('#toolbarButton').addClass('open');
    $('#' + activeToolbar + 'Tab').removeClass('activeTab');
    $('#' + toolbar + 'Tab').addClass('activeTab');
    $('#toolbarBody').animate({
        width: Math.max(10, Math.min($('#diagramJumbo').width() - 60, settings.toolbar))
    }, {
        duration: 100
    });

    toolbarState = true;
    activeToolbar = toolbar;

    switch (toolbar) {
        case 'tools':
            $('#toolsForm').show();
            $('#notesForm').hide();
            $('#filesForm').hide();
            $('#propFillColorSpan').show();
            // editing an object
            if (canvas.getActiveObject()) {
                toolbarEditObject();

            // new object
            } else if (canvas.getActiveObject() === undefined || canvas.getActiveObject() === null) {
               
                toolbarNewObject();
            }
            break;

        case 'notes':
            $('#toolsForm').hide();
            $('#notesForm').show();
            $('#filesForm').hide();
            break;

        case 'files':
            $('#toolsForm').hide();
            $('#notesForm').hide();
            $('#filesForm').show();
            break;
    }
}

function closeToolbar() {
    if (activeToolbar) {
        $('#' + activeToolbar + 'Tab').removeClass('activeTab');
    }
    $('#toolbarButton').removeClass('open');
    toolbarState = false;
    $('#propName').blur();
    $('#toolbarBody').animate({
        width: "0px"
    }, 200);
}

// update the toolbox when a new icon is clicked
function updateSelection(options) {
    var o = options.target;
    if (o && canvas.getActiveObject()) {
        if (o.objType !== undefined) {
            if (creatingLink) {
                if ((o.objType === 'icon' || o.objType === 'shape') && firstNode !== o) {
                    if (firstNode === null) {
                        firstNode = o;
                        showMessage('Click on a second node to complete the link.');
                    } else {
                        showMessage('Link created.', 5);
                        $('#cancelLink').hide();
                        lastFillColor = $('#propFillColor').val();
                        lastFillColor = $('#propStrokeColor').val();
                        socket.send(JSON.stringify({
                            act: 'insert_object',
                            arg: {
                                name: $('#propName').val(),
                                type: 'link',
                                image: $('#prop-link').val().replace('.png', '.svg'),
                                stroke_color: $('#propStrokeColor').val(),
                                fill_color: $('#propFillColor').val(),
                                obj_a: firstNode._id,
                                obj_b: o._id,
                                x: 0,
                                y: 0,
                                z: 0,
                                locked: $('#lockObject').is(':checked')
                            },
                            msgId: msgHandler()
                        }));
                        firstNode = null;
                        creatingLink = false;
                    }
                }
            } else {
                toolbarEditObject();
                $('#propID').val(o._id);
                $('#propFillColor').val(o.fill);
                $('#propFillColor').data('paletteColorPickerPlugin').reload();
                $('#propStrokeColor').val(o.stroke);
                $('#propStrokeColor').data('paletteColorPickerPlugin').reload();
                $('#objectWidth').val(Math.round(o.width * o.scaleX));
                $('#objectHeight').val(Math.round(o.height * o.scaleY));
                $('#lockObject').prop('checked', o.locked);
                $('#propName').val('');

                if (o.children !== undefined) {
                    for (var i = 0; i < o.children.length; i++) {
                        if (o.children[i].objType === 'name')
                            $('#propName').val(o.children[i].text);
                    }
                }

                $('#propType').val(o.objType);
                $('#prop-' + o.objType).val(o.image.replace('.svg', '.png'));
                $('#prop-' + o.objType).data('picker').sync_picker_with_select();
                if (toolbarState)
                    openToolbar('tools');
                if (options.e && options.e.ctrlKey)
                    editDetails();
            }
        }
    }
}

function newNote() {
    bootbox.prompt('Note name?', function (name) {
        socket.send(JSON.stringify({
            act: 'insert_note',
            arg: {
                name: name
            },
            msgId: msgHandler()
        }));
    });
}

function newObject() {
    canvas.discardActiveObject();
    canvas.requestRenderAll();
    openToolbar('tools');
}

function cancelMenu() {
    $(window).off('contextmenu', cancelMenu);
    return false;
}

function insertLink() {
    creatingLink = true;
    showMessage('Click on a node to start a new link.');
    $('#cancelLink').show();
}

function cancelLink() {
    creatingLink = false;
    showMessage('Link cancelled.', 5);
    $('#cancelLink').hide();
}

function updatePropFillColor(color) {
    var o = canvas.getActiveObject();
    if (o) {
        lastFillColor = $('#propFillColor').val();
        o.fill = color;
        changeObject(o);
    }
}

function updatePropStrokeColor(color) {
    var o = canvas.getActiveObject();
    if (o) {
        lastStrokeColor = $('#propStrokeColor').val();
        o.stroke = color;
        changeObject(o);
    }
}

function updatePropName(name) {
    var o = canvas.getActiveObject();
    if (o) {
        for (var i = 0; i < o.children.length; i++) {
            if (o.children[i].objType === 'name')
                o.children[i].text = name;
        }
        changeObject(o);
        canvas.requestRenderAll();
    }
}

function editDetails(id, name) {
    var rw = false;
    if (!name)
        name = '';
    if (!id && canvas.getActiveObject()) {
        if (permissions.modify_notes)
            rw = true;
        id = 'm-' + mission_id + 'd-' + canvas.getActiveObject()._id;
        if (canvas.getActiveObject().name_val)
            name = canvas.getActiveObject().name_val.split('\n')[0];
    } else {
        if (permissions.modify_notes)
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
            openDocs[id] = shareDBConnection.get('sharedb', id);
            openDocs[id].subscribe(function (err) {
                if (openDocs[id].type === null) {
                    openDocs[id].create('', 'rich-text');
                }
                if (err) throw err;
                if (openDocs[id].type.name === 'rich-text') {
                    // create window
                    var w = windowManager.createWindow({
                        sticky: false,
                        title: name,
                        effect: 'none',
                        bodyContent: '<div id="object_details_' + id + '" class="object-details" style="resize: none;"></div>',
                        closeCallback: function () {
                            openDocs[id].destroy();
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
                    var quill = new Quill('#object_details_' + id, {
                        theme: 'snow',
                        readOnly: !rw,
                        modules: {
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

                    quill.root.setAttribute('spellcheck', false)
                    quill.setContents(openDocs[id].data);
                    quill.on('text-change', function (delta, oldDelta, source) {
                        if (source !== 'user') return;
                        openDocs[id].submitOp(delta, {
                            source: quill
                        });
                    });

                    openDocs[id].on('op', function (op, source) {
                        if (source === quill) return;
                        quill.updateContents(op);
                    });

                    $('#object_details_' + id).overlayScrollbars({
                        className: "os-theme-dark"
                    });

                } else {
                    var disabled = ' disabled';
                    if (permissions.modify_details) {
                        disabled = '';
                    }

                    // create window
                    var w = windowManager.createWindow({
                        sticky: false,
                        title: name,
                        effect: 'none',
                        bodyContent: '<textarea id="object_details_' + id + '" class="object-details" style="resize: none; height: 100%"' + disabled + '></textarea>',
                        closeCallback: function () {
                            openDocs[id].destroy();
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

                    var element = document.getElementById('object_details_' + id);
                    var binding = new StringBinding(element, openDocs[id]);
                    binding.setup();
                }
            });
        } else
            console.log('document already open');
    }
}

// send inesert message for inserted objects
function insertObject() {
    closeToolbar();
    if ($('#propType').val() === 'link')
        insertLink();
    else {
        var center = new fabric.Point(canvas.width / 2, canvas.height / 2);
        lastFillColor = $('#propFillColor').val();
        lastStrokeColor = $('#propStrokeColor').val();
        socket.send(JSON.stringify({
            act: 'insert_object',
            arg: {
                name: $('#propName').val(),
                fill_color: $('#propFillColor').val(),
                stroke_color: $('#propStrokeColor').val(),
                locked: $('#lockObject').is(':checked'),
                image: $('#prop-' + $('#propType').val()).val().replace('.png', '.svg'),
                type: $('#propType').val(),
                x: Math.round(center.x / canvas.getZoom() - settings.x / canvas.getZoom()),
                y: Math.round(center.y / canvas.getZoom() - settings.y / canvas.getZoom()),
                z: canvas.getObjects().length
            },
            msgId: msgHandler()
        }));
    }
}

// bottom table toggle
function toggleTable(toolbar) {
    if (toolbar === activeTable) {
        return;
    }
    $('#' + activeTable).hide();
    $('#' + activeTable + 'Tab').removeClass('activeTab');
    $('#' + toolbar).show();
    $('#' + toolbar + 'Tab').addClass('activeTab');
    activeTable = toolbar;

    switch (toolbar) {
        case 'chat':
            break;

        case 'settings':
            settingsTabulator.redraw();
            break;

        case 'events':
            eventsTabulator.redraw();
            break;

        case 'opnotes':
            opnotesTabulator.redraw();
            break;
    }
}

// READY!
$(document).ready(function () {
    // bind buttons
    if (permissions.modify_diagram) {
        $('#propName').prop('disabled', false);
        $('#newObjectButton').prop('disabled', false).click(newObject);
        $('#propFillColor').prop('disabled', false);
        $('#propStrokeColor').prop('disabled', false);
        $('#lockObject').prop('disabled', false);
        $('#moveUp').prop('disabled', false).click(moveUp);
        $('#moveDown').prop('disabled', false).click(moveDown);
        $('#moveToFront').prop('disabled', false).click(moveToFront);
        $('#moveToBack').prop('disabled', false).click(moveToBack);
        $('#objectWidth').prop('disabled', false);
        $('#objectHeight').prop('disabled', false);
        $('#insertObjectButton').prop('disabled', false).click(insertObject);
        $('#deleteObjectButton').prop('disabled', false).click(deleteObjectConfirm);;
    }
    if (permissions.modify_notes) {
        $("#newNoteButton").prop('disabled', false);
    }
    $('#propName').change(function () {
        updatePropName(this.value)
    });
    $('#lockObject').change(function () {
        toggleObjectLock($('#lockObject').is(':checked'))
    });
    $('#objectWidth').change(function () {
        setObjectSize();
    });
    $('#objectHeight').change(function () {
        setObjectSize();
    });
    $('#closeToolbarButton').click(closeToolbar);
    $('#cancelLinkButton').click(cancelLink);
    $('#editDetailsButton').click(function () {
        editDetails();
    });
    $('#newNoteButton').click(function () {
        newNote();
    });

    // toolbar tabs
    $('#toolbarButton').click(function () {
        toggleToolbar(activeToolbar);
    });
    $('#toolsTab').click(function () {
        toggleToolbar('tools');
    });
    $('#notesTab').click(function () {
        toggleToolbar('notes');
    });
    $('#filesTab').click(function () {
        toggleToolbar('files');
    });

});