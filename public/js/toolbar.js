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

// set toolbar for editing
function toolbarEditObject() {
    if (canvas.getActiveObjects().length > 1) {
        $("#toolbarBody").addClass("disabledDiv");
    } else {
        $("#toolbarBody").removeClass("disabledDiv");
    }

    if (permissions.write_access) {
        $('#toolbarTitle').html('Edit Object');
    } else {
        $('#toolbarTitle').text('View Object');
    }

    $('#propNameGroup').show();
    $('#propObjectGroup').show();
    $('#editNotesButton').show();
    $('#deleteObjectButton').show();
    $('#insertObjectButton').hide();
    $('#newObjectButton').show();

    var objType = $('#propType').val();

    if (objType === 'link') {
        $('#sizeObject').hide();
        $('#lockObjectGroup').hide();
        $('#propFillColorSpan').hide();
    } else {
        $('#sizeObject').show();
        $('#lockObjectGroup').show();
    }
    $('#moveObject').show();
    activeSubToolbar = 'editObject';
}

// set toolbar for new objects
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
    //$('#prop-icon').data('picker').sync_picker_with_select();
    $('#moveObject').hide();
    $('#newObjectButton').hide();
    $('#editNotesButton').hide();
    $('#deleteObjectButton').hide();
    $('#insertObjectButton').show();

    activeSubToolbar = 'newObject';
}

function openToolbar(toolbar) {
    $('#toolbarButton').addClass('open');
    $('#' + activeToolbar + 'Tab').removeClass('activeTab');
    $('#' + toolbar + 'Tab').addClass('activeTab');

    if (!toolbarState) {
        $('#toolbarBody').animate({
            width: Math.max(10, Math.min($('#diagramJumbo').width() - 60, settings.toolbar))
        }, {
            duration: 100
        });
        toolbarState = true;
    }

    activeToolbar = toolbar;

    switch (toolbar) {
        case 'tools':
            $('#toolsForm').show();
            $('#notesForm').hide();
            $('#filesForm').hide();
            $('#propFillColorSpan').show();
            // editing an object
            if (false) {
                toolbarEditObject();
            // new object
            } else if (true) {
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
    $('#toolbarBody').animate({
        width: "0px"
    }, 200);
}

// update the toolbox when a new icon is clicked
function updateSelection(options) {
    if (options) {
        var o = options.target;
        if (o && canvas.getActiveObject()) {
            if (o.objType !== undefined) {
                // selecting an object
                $('#propType').val(o.objType);
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

                $('#prop-' + o.objType).val(o.image.replace('.svg', '.png'));
                $('#prop-' + o.objType).data('picker').sync_picker_with_select();
                if (toolbarState)
                    openToolbar('tools');
                if (options.e && options.e.ctrlKey)
                    editDetails();

                toolbarEditObject();

            }
        }
    // selected nothing, set toolbar for new object
    } else {
        toolbarNewObject();
    }
}

function newObject() {
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

// change colors
function updatePropFillColor(color) {
    
}

function updatePropStrokeColor(color) {
    
}

// rename object
function updatePropName(name) {
    
}

function editDetails(id, name) {
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
            openDocs[id] = shareDBConnection.get('sharedb', id);
            openDocs[id].subscribe(function (err) {
                if (openDocs[id].type === null) {
                    console.log('create');
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

                    //var element = document.getElementById('object_details_' + id);
                    //var binding = new StringBinding(element, openDocs[id]);
                    //binding.setup();
                }
            });
        } else
            console.log('document already open');
    }
}

// send insert message for inserted objects
function insertObject() {

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

function blark(e) {
    console.log(e);
}

// READY!
$(window).on('load', function () {
    // bind buttons
    if (permissions.write_access) {
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

    if (permissions.write_access) {
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

    $('#cancelLinkButton').click(cancelLink);

    $('#editNotesButton').click(function () {
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


    // load SVG icons
    for (var i = 0; i < icons.length; i++) {
        $.ajax('/images/icons/' + icons[i], {
            dataType: 'text',
            processData: false,
            success: function(data) {
                $('#propObjectGroup').append('<img src=\'data:image/svg+xml;utf8,' + data + '\' class="icon">');
            }
        });
    }

    $('.icon').on('dragstart', function(evt) {
        console.log('dragstart', evt);
    });

});