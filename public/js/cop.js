function getParameterByName(name, url) {
    if (!url) url = window.location.href;
    name = name.replace(/[\[\]]/g, "\\$&");
    var regex = new RegExp("[?&]" + name + "(=([^&#]*)|&|#|$)"),
        results = regex.exec(url);
    if (!results) return null;
    if (!results[2]) return '';
    return decodeURIComponent(results[2].replace(/\+/g, " "));
}
mission_id = getParameterByName('mission');

// ---------------------------- PERMISSIONS & BUTTONS ----------------------------------
if (!permissions) {
    permissions = {
        manage_users: false,
        write_access: false,
        delete_access: false,
        api_access: false
    };
}

// ---------------------------- MINIMAP ----------------------------------
var minimap = document.getElementById('minimapCanvas');
var minimapBg = document.getElementById('minimapBgCanvas');
var minimapCtx = minimap.getContext('2d');
var minimapBgCtx = minimapBg.getContext('2d');
minimap.width = minimapBg.width = 100;
minimap.height = minimapBg.height = 100;

// ---------------------------- GLOBALS ----------------------------------
var settings = {
    'zoom': 1.0,
    'x': Math.round($('#diagramJumbo').width() / 2),
    'y': Math.round(700 / 2),
    'diagram': 700,
    'toolbar': 400,
    'tables': 350
};
var earliest_messages = {}; //= 2147483647000;
var creatingLink = false;
var userSelect = [];
var objectSelect = [{ _id: null, name: null }];
var objectsLoaded = null;
var updatingObject = false;
var socket;
var firstNode = null;
var SVGCache = {};
var tempLinks = [];
var guides = {};
var resizeTimer = null;
var updateSettingsTimer = null;
var objectMovingTimer = null;
var objectSearchResults = [];
var objectSearchPtr = null;

var lastClick = null;
var msgId = 0;
var pendingMsg = [];
var lastFillColor = '#000000';
var lastStrokeColor = '#ffffff';
var windowManager = null;
var canvasClipboard = [];
var settingsTabulator;
var timeline = null;
var timelinePosition = null;

var wsdb;
var openDocs = {};
var shareDBConnection;

// ---------------------------- LOADING / CACHING OF STUFF ----------------------------------
// check if shapes are chached before loading canvas
function checkIfShapesCached(msg) {
    if (objectsLoaded.length == 0) {
        console.log('cached');
        for (var o in msg) {
            objectsLoaded.push(false);
            addObjectToCanvas(msg[o]);
        }
        checkIfObjectsLoaded();
    } else {
        setTimeout(function () {
            checkIfShapesCached(msg);
        }, 50);
    }
}

// check if objects are all added to the canvas before first draw
// we're basically ready after this
function checkIfObjectsLoaded() {
    if (objectsLoaded.length == 0) {
        console.log('objects loaded');
        $('#modal').modal('hide');
        //FIXME
        // objects loaded, update the events tracker
        updateLinks();
        updateMinimapBg();
        canvas.requestRenderAll();
        canvas.renderOnAddRemove = true;
    } else {
        setTimeout(checkIfObjectsLoaded, 50);
    }
}

// grab icons from the server
function getIcon(icon, cb) {
    var path = 'images/icons/';
    if (!SVGCache[icon]) {
        $.get(path + icon, function (data) {
            fabric.loadSVGFromString(data, function (objects, options) {
                SVGCache[icon] = fabric.util.groupSVGElements(objects, options);
                if (cb) {
                    cb();
                }
                objectsLoaded.pop();
            });
        }, 'text').fail(function () {
            $.get(path + 'missing.svg', function (data) {
                fabric.loadSVGFromString(data, function (objects, options) {
                    SVGCache[icon] = fabric.util.groupSVGElements(objects, options);
                    if (cb) {
                        cb();
                    }
                    objectsLoaded.pop();
                });
            }, 'text')
        });
    } else {
        objectsLoaded.pop();
        if (cb) {
            cb();
        }
    }
}


// ---------------------------- SETTINGS COOKIE ----------------------------------
function loadSettings() {
    if (decodeURIComponent(document.cookie) === '')
        document.cookie = "mcscop-settings=" + JSON.stringify(settings);
    var dc = decodeURIComponent(document.cookie);
    settings = JSON.parse(dc.split('mcscop-settings=')[1]);
    $('#diagramJumbo').height(settings.diagram);
    $('#bottomJumbo').height(settings.tables);
    canvas.setZoom(settings.zoom);
    canvas.relativePan({
        x: settings.x,
        y: settings.y
    });
}

function updateSettings() {
    if (updateSettingsTimer)
        window.clearTimeout(updateSettingsTimer);
    updateSettingsTimer = setTimeout(function () {
        document.cookie = "mcscop-settings=" + JSON.stringify(settings);
    }, 100);
}


// ---------------------------- Minimap Functions ----------------------------------
function updateMinimap() {
    var scaleX = 100 / (MAXWIDTH * 2);
    var scaleY = 100 / (MAXHEIGHT * 2);
    var zoom = canvas.getZoom();
    var mLeft = (MAXHEIGHT - settings.x / zoom) * scaleX;
    var mTop = (MAXHEIGHT - settings.y / zoom) * scaleY;
    var mWidth = (canvas.width / zoom) * scaleX;
    var mHeight = (canvas.height / zoom) * scaleY;
    minimapCtx.strokeStyle = '#ffffff';
    minimapCtx.clearRect(0, 0, minimapCtx.canvas.width, minimapCtx.canvas.height);
    minimapCtx.beginPath();
    minimapCtx.rect(mLeft, mTop, mWidth, mHeight);
    minimapCtx.stroke();
}

function updateMinimapBg() {
    var scaleX = 100 / (MAXWIDTH * 2);
    var scaleY = 100 / (MAXHEIGHT * 2);
    minimapBgCtx.clearRect(0, 0, minimapCtx.canvas.width, minimapCtx.canvas.height);
    for (var i = 0; i < canvas.getObjects().length; i++) {
        if (canvas.item(i).objType === 'icon' || canvas.item(i).objType === 'shape') {
            minimapBgCtx.fillStyle = '#ffffff';
            minimapBgCtx.fillRect((MAXWIDTH + canvas.item(i).left) * scaleX, (MAXHEIGHT + canvas.item(i).top) * scaleY, 2, 2);
        }
    }
}


// ---------------------------- SOCKET.IO MESSAGES / HANDLERS ----------------------------------
function cleanupRow(row) {
    if (typeof(row) !== 'object') {
        return row;
    }

    var keys = Object.keys(row);
    for (var i = 0; i < keys.length; i++) {
        if (!row[keys[i]]) {
            row[keys[i]] = '';
        }
    }

    return row;
}

function msgHandler() {
    pendingMsg[msgId] = setTimeout(function () {
        for (m in pendingMsg) {
            clearTimeout(pendingMsg[m]);
        }
        clearInterval(socket.pingInterval);
        canvas.clear();
        canvas.requestRenderAll();
        $('#modal-close').hide();
        $('#modal-header').html('Attention!');
        $('#modal-body').html('<p>Connection lost! Please refresh the page to continue!</p>');
        $('#modal-footer').html('');
        $('#modal-content').removeAttr('style');
        $('#modal-content').removeClass('modal-details');
        $('#modal').removeData('bs.modal').modal({
            backdrop: 'static',
            keyboard: false
        });
    }, 30000);
    return msgId++;
}

// send chat message to db
function sendChatMessage(msg, channel) {
    socket.send(JSON.stringify({
        act: 'insert_chat',
        arg: {
            channel: channel,
            text: msg
        },
        msgId: msgHandler()
    }));
}

// show message above canvas for link creation, etc
function showMessage(msg, timeout) {
    $('#message').html('<span class="messageHeader">' + msg + '</span>');
    $('#message').show();
    if (timeout !== undefined) {
        setTimeout(function () {
            $('#message').html('');
            $('#message').hide();
        }, timeout * 1000);
    }
}

//download diagram to png
function downloadDiagram(link) {
    var viewport = canvas.viewportTransform;
    canvas.setHeight(MAXHEIGHT * 2);
    canvas.setWidth(MAXWIDTH * 2);
    canvas.viewportTransform = [1, 0, 0, 1, MAXWIDTH, MAXHEIGHT];
    link.href = canvas.toDataURL('png');
    link.download = 'diagram.png';
    canvas.viewportTransform = viewport;
    resizeCanvas();
    canvas.requestRenderAll();
}

// setup times for cop clocks
function startTime() {
    var today = new Date();
    var eh = today.getHours();
    var uh = today.getUTCHours();
    var m = today.getMinutes();
    var s = today.getSeconds();
    m = addZero(m);
    s = addZero(s);
    $('#est').html('Local: ' + eh + ":" + m + ":" + s);
    $('#utc').html('UTC: ' + uh + ":" + m + ":" + s);
    var t = setTimeout(startTime, 500);
}

function deleteObjectConfirm() {
    $('#modal-title').text('Are you sure?');
    $('#modal-body').html('<p>Are you sure you want to delete this object?</p><p>Deleting an object will delete all attached notes.</p>');
    $('#modal-footer').html('<button type="button btn-primary" class="button btn btn-danger" data-dismiss="modal" onClick="deleteObject();">Yes</button> <button type="button btn-primary" class="button btn btn-default" data-dismiss="modal">No</button>');
    $('#modal-content').removeAttr('style');
    $('#modal-content').removeClass('modal-details');
    $('#modal').modal('show')
}

function sortByName(a, b) {
    return a.name.localeCompare(b.name);
}

function timelineCancel() {
    $('#message').hide();
    eventsTabulator.deselectRow();
    timeline = null;
    timelinePosition = 0;

    if (tempLinks.length > 0) {
        for (var i = 0; i < tempLinks.length; i++) {
            canvas.remove(tempLinks[i]);
        }
        tempLinks = [];
    }
}

function timelineAdvance(offset) {
    eventsTabulator.deselectRow();
    if (timeline === null) {
        timeline = eventsTabulator.getColumn('_id').getCells();
        timelinePosition = 0;
    } else {
        timelinePosition += offset;
        if (timelinePosition >= timeline.length) {
            timelinePosition = 0;
        }
        if (timelinePosition < 0) {
            timelinePosition = timeline.length - 1;
        }
    }

    if (timeline) {
        var row = timeline[timelinePosition].getData();
        eventsTabulator.selectRow(row._id);
        $('#message').html('<span class="messageHeader">' + row.event_time + '</span><br/><span class="messageBody">' + row.short_desc.replace('\n','<br>') + '</span>');
        $('#message').show();

        if (tempLinks.length > 0) {
            for (var i = 0; i < tempLinks.length; i++) {
                canvas.remove(tempLinks[i]);
            }
            tempLinks = [];
        }

        var from = null;
        var to = null;
        var tempLink;

        for (var j = 0; j < canvas.getObjects().length; j++) {
            if (canvas.item(j)._id && (canvas.item(j)._id == row.source_object || canvas.item(j)._id == row.dest_object)) {
                if (canvas.item(j)._id == row.source_object) {
                    from = canvas.item(j);
                    var shape = new fabric.Rect({
                        dad: from,
                        objType: 'shape',
                        width: from.width * from.scaleX + 10,
                        height: from.height * from.scaleY + 10,
                        stroke: 'red',
                        fill: 'rgba(0,0,0,0)',
                        strokeWidth: 5,
                        originX: 'left',
                        originY: 'top',
                        left: from.left - 7.5,
                        top: from.top - 7.5,
                        selectable: false,
                        evented: false
                    });
                    var tempShape = shape;
                    tempLinks.push(tempShape);
                    //canvas.add(shape);
                } else if (canvas.item(j)._id == row.dest_object) {
                    to = canvas.item(j);
                    var shape = new fabric.Rect({
                        dad: to,
                        objType: 'shape',
                        width: to.width * to.scaleX + 10,
                        height: to.height * to.scaleY + 10,
                        stroke: 'red',
                        fill: 'rgba(0,0,0,0)',
                        strokeWidth: 5,
                        originX: 'left',
                        originY: 'top',
                        left: to.left - 7.5,
                        top: to.top - 7.5,
                        selectable: false,
                        evented: false
                    });
                    var tempShape = shape;
                    tempLinks.push(tempShape);
                }
            }

            if (from && to) {
                var line = new fabric.Line([getObjCtr(from).x, getObjCtr(from).y, getObjCtr(to).x, getObjCtr(to).y], {
                    objType: 'link',
                    from: from,
                    to: to,
                    stroke: 'red',
                    strokeColor: 'red',
                    strokeWidth: 8,
                    strokeDashArray: [15,10],
                    selectable: false,
                    evented: false
                });
                tempLink = line;
                tempLinks.push(tempLink);
                break;
            }
        }
        for (var i = 0; i < tempLinks.length; i++) {
            canvas.add(tempLinks[i]);
        }
    }
}

// add user to user table dialog box
function addUser() {
    var msg = `
<form>
    <div class="form-group">
        <label for="nuUserId">User:</label>
        <select class="form-control" id="nuUserId">`;

    for (var i = 0; i < userSelect.length; i++) {
        msg += '<option value="' + userSelect[i]._id + '">' + userSelect[i].username + '</option>';
    }

    msg += `
        </select>
    </div>
    <div class="form-check">
        <input type="checkbox" class="form-check-input" id="nuPermManageUsers">
        <label class="form-check-label" for="nuPermManageUsers">Manage Users</label>
    </div>
    <div class="form-check">
        <input type="checkbox" class="form-check-input" id="nuPermWriteAccess">
        <label class="form-check-label" for="nuPermWriteAccess">Write Access</label>
    </div>
    <div class="form-check">
        <input type="checkbox" class="form-check-input" id="nuPermDeleteAccess">
        <label class="form-check-label" for="nuPermDeleteAccess">Delete Access</label>
    </div>
    <div class="form-check">
        <input type="checkbox" class="form-check-input" id="nuPermApiAccess">
        <label class="form-check-label" for="nuPermApiAccess">API Access</label>
    </div>
</form>`;

    bootbox.dialog({
        message: msg,
        title: 'Add User',
        buttons: {
            confirm: {
                label: 'Insert',
                className: 'btn-primary',
                callback: function () {
                    var user = {};
                    user.user_id = $('#nuUserId').val();
                    user.permissions = {
                            manage_users: $('#nuPermManageUsers').is(":checked"),
                            write_access: $('#nuPermWriteAccess').is(":checked"),
                            delete_access: $('#nuPermDeleteAccess').is(":checked"),
                            api_access: $('#nuPermApiAccess').is(":checked"),
                        },
                        socket.send(JSON.stringify({
                            act: 'insert_mission_user',
                            arg: user,
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

// add event to event table dialog box
function addEvent() {
    // sort the objects
    objectSelect.sort(sortByName);

    var msg = `
<form>
    <div class="form-group row">
        <label for="neDiscoveryTime" class="col-sm-4 col-form-label">Discovery Time:</label>
        <div class="col-sm-8">
            <div class="input-group date" id="neDiscoveryTime" data-target-input="nearest">
                <input type="text" class="form-control datetimepicker-input" data-target="#neDiscoveryTime"/>
                <div class="input-group-append" data-target="#neDiscoveryTime" data-toggle="datetimepicker">
                    <div class="input-group-text"><i class="fa fa-calendar"></i></div>
                </div>
            </div>
        </div>
    </div>
    <div class="form-group row">
        <label for="neEventTime" class="col-sm-4 col-form-label">Event Time:</label>
        <div class="col-sm-8">
            <div class="input-group date" id="neEventTime" data-target-input="nearest">
                <input type="text" class="form-control datetimepicker-input" data-target="#neEventTime"/>
                <div class="input-group-append" data-target="#neEventTime" data-toggle="datetimepicker">
                    <div class="input-group-text"><i class="fa fa-calendar"></i></div>
                </div>
            </div>
        </div>
    </div>
    <div class="form-group row">
        <label for="neSourceObject" class="col-sm-4 col-form-label">Source:</label>
        <div class="col-sm-8">
            <select class="form-control" id="neSourceObject">`;

    for (var i = 0; i < objectSelect.length; i++) {
        msg += '<option value="' + objectSelect[i]._id + '">' + objectSelect[i].name + '</option>';
    }

    msg += `
            </select>
        </div>
    </div>
    <div class="form-group row">
        <label for="neDestObject" class="col-sm-4 col-form-label">Destination:</label>
        <div class="col-sm-8">
            <select class="form-control" id="neDestObject">`;

    for (var i = 0; i < objectSelect.length; i++) {
        msg += '<option value="' + objectSelect[i]._id + '">' + objectSelect[i].name + '</option>';
    }

    msg += `
            </select>
        </div>
    </div>
    <div class="form-group row">
        <label for="neEventType" class="col-sm-4 col-form-label">Event Type:</label>
        <div class="col-sm-8">
            <input type="text" class="form-control" id="neEventType">
        </div>
    </div>
    <div class="form-group">
        <label for="neShortDesc">Short Description:</label>
        <textarea class="form-control" id="neShortDesc" rows="3"></textarea>        
    </div>
    <script type="text/javascript">
        $(function () {
            $('#neDiscoveryTime').datetimepicker({ defaultDate: moment() });
            $('#neEventTime').datetimepicker({ defaultDate: moment() });
        });
    </script>
</form>`;

    bootbox.dialog({
        message: msg,
        title: 'Add Event',
        buttons: {
            confirm: {
                label: 'Insert',
                className: 'btn-primary',
                callback: function () {
                    var event = {};
                    event.discovery_time = $('#neDiscoveryTime').datetimepicker('date').format();
                    event.event_time = $('#neEventTime').datetimepicker('date').format();
                    event.source_object = $('#neSourceObject').val();
                    event.dest_object = $('#neDestObject').val();
                    event.event_type = $('#neEventType').val();
                    event.short_desc = $('#neShortDesc').val();
                    socket.send(JSON.stringify({
                        act: 'insert_event',
                        arg: event,
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

function addOpnote() {
    // sort the objects
    objectSelect.sort(sortByName);

    var msg = `
<form>
    <div class="form-group row">
        <label for="noTime" class="col-sm-4 col-form-label">Opnote Time:</label>
        <div class="col-sm-8">
            <div class="input-group date" id="noTime" data-target-input="nearest">
                <input type="text" class="form-control datetimepicker-input" data-target="#noTime"/>
                <div class="input-group-append" data-target="#noTime" data-toggle="datetimepicker">
                    <div class="input-group-text"><i class="fa fa-calendar"></i></div>
                </div>
            </div>
        </div>
    </div>
    <div class="form-group row">
        <label for="noTarget" class="col-sm-4 col-form-label">Target:</label>
        <div class="col-sm-8">
            <input type="text" class="form-control" id="noTarget">
        </div>
    </div>
    <div class="form-group row">
        <label for="noTool" class="col-sm-4 col-form-label">Tool:</label>
        <div class="col-sm-8">
            <input type="text" class="form-control" id="noTool">
        </div>
    </div>
    <div class="form-group">
        <label for="noAction">Action:</label>
        <textarea class="form-control" id="noAction" rows="3"></textarea>        
    </div>
    <script type="text/javascript">
        $(function () {
            $('#noTime').datetimepicker({ defaultDate: moment() });
        });
    </script>
</form>`;

    bootbox.dialog({
        message: msg,
        title: 'Add Opnote',
        buttons: {
            confirm: {
                label: 'Insert',
                className: 'btn-primary',
                callback: function () {
                    var opnote = {};
                    opnote.opnote_time = $('#noTime').datetimepicker('date').format();
                    opnote.target = $('#noTarget').val();
                    opnote.tool = $('#noTool').val();
                    opnote.action = $('#noAction').val();
                    socket.send(JSON.stringify({
                        act: 'insert_opnote',
                        arg: opnote,
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

var dateEditor = function (cell, onRendered, success, cancel) {
    var editor = document.createElement("input");
    editor.setAttribute('id','dateTimePicker');
    var called = false;

    onRendered(function (){
        var dtp = $('#dateTimePicker');
        dtp.addClass("datetimepicker-input")
        dtp.css({
            width: '100%',
            height: '100%',
        })
        dtp.focus();
        dtp.attr('data-toggle', 'datetimepicker');
        dtp.attr('data-target', '#dateTimePicker');
        dtp.datetimepicker({ widgetParent: 'body' });
        dtp.datetimepicker('show');
        var picker = $('body').find('.bootstrap-datetimepicker-widget:last');
        picker.css({
            'bottom': document.body.getBoundingClientRect().bottom - cell._cell.element.getBoundingClientRect().y + 'px',
            'left': cell._cell.element.getBoundingClientRect().x + 'px',
            'top': 'auto'
        })
    });

    function successFunc(){
        if (called) {
            return;
        }
        called = true;
        window.removeEventListener("scroll", successFunc, true);
        $('#dateTimePicker').datetimepicker('date', $('#dateTimePicker').val());
        success($('#dateTimePicker').datetimepicker('date').format());
        $('#dateTimePicker').datetimepicker('destroy');
    }

    editor.addEventListener("change", successFunc);
    editor.addEventListener("blur", successFunc);
    // remove on scroll also
    //window.addEventListener("scroll", successFunc, true);

    return editor;
}

// READY!
$(window).on('load', function () {
    $('#modal-title').text('Please wait...!');
    $('#modal-body').html('<p>Loading COP, please wait...</p><img src="images/loading.gif"/>');
    $('#modal-footer').html('');
    //$('#modal').modal('show');

    // scrollbars
    $('#toolsForm').overlayScrollbars({
        className: "os-theme-light"
    });
    $('#notesForm').overlayScrollbars({
        className: "os-theme-light",
        overflowBehavior: { x: 'hidden' }
    });
    $('#filesForm').overlayScrollbars({
        className: "os-theme-light",
        overflowBehavior: { x: 'hidden' }
    });
    $('#logPane').overlayScrollbars({
        className: "os-theme-light"
    });
    $('#generalPane').overlayScrollbars({
        className: "os-theme-light"
    });
    $('#propObjectGroup').overlayScrollbars({
        className: "os-theme-dark"
    });
    $('.tableBody').overlayScrollbars({
        className: "os-theme-light"
    });

    // start clocks
    startTime();

    // save last thing clicked
    $(window).click(function (e) {
        lastClick = e.target;
    });

    // draggable / resizable modals
    $('.modal-dialog').draggable({
        handle: '.modal-header'
    });
    $('.modal-content').resizable({
        minHeight: 153,
        minWidth: 300
    });

    // prevent bootbox from reloading on submit / enter
    $(document).on("submit", ".bootbox form", function (e) {
        e.preventDefault();
        $(".bootbox .btn-primary").click();
    });

    // ---------------------------- SOCKETS ----------------------------------
    if (location.protocol === 'https:') {
        socket = new WebSocket('wss://' + window.location.host + '/mcscop/');
        wsdb = new WebSocket('wss://' + window.location.host + '/mcscop/');
    } else {
        socket = new WebSocket('ws://' + window.location.host + '/mcscop/');
        wsdb = new WebSocket('ws://' + window.location.host + '/mcscop/');
    }
    shareDBConnection = new ShareDB.Connection(wsdb);
    wsdb.onopen = function () {
        wsdb.send(JSON.stringify({
            act: 'stream',
            arg: ''
        }));
    };

    // ---------------------------- IMAGE PICKER ----------------------------------
    $('#propObjectGroup').tabs({
        beforeActivate: function (e, u) {
            $('#propType').val(u.newPanel.attr('id').split('-')[1]);
            if ($('#propType').val() === 'link')
                $('#propFillColorSpan').hide();
            else
                $('#propFillColorSpan').show();
        }
    });
    $.each(['icon', 'shape', 'link'], function (i, v) {
        $('#prop-' + v).imagepicker({
            hide_select: true,
            initialized: function () {
                if (!permissions.write_access)
                    $("#propObjectGroup").find("div").unbind('click');
            },
            selected: function () {
                if (!permissions.write_access)
                    return;
                if (canvas.getActiveObject() !== null && canvas.getActiveObject() !== undefined && (canvas.getActiveObject().objType === 'icon' || canvas.getActiveObject().objType === 'shape')) {
                    var obj = canvas.getActiveObject();
                    var oldZ = canvas.getObjects().indexOf(canvas.getActiveObject());
                    obj.image = $(this).val().replace('.png', '.svg');
                    var type = $(this).val().split('-')[2];
                    if (obj.objType !== type)
                        return;
                    updatingObject = true;
                    changeObject(obj);
                    updatingObject = false;
                } else {
                    var type = $(this).val().split('-')[2];
                    $('#propType').val(type)
                }
            }
        });
    });

    // ---------------------------- TABLES ----------------------------------   
    // bottom table tabs
    $('#chatTab').click(function () {
        toggleTable('chat');
    });
    if (permissions.manage_users) {
        $('#settingsTab').show();
        $('#settingsTabTag').show();
    }

    // attach events to tab buttons
    $('#settingsTab').click(function () {
        toggleTable('settings');
    });
    $('#eventsTab').click(function () {
        toggleTable('events');
    });
    $('#opnotesTab').click(function () {
        toggleTable('opnotes');
    });

    // attach events to add buttons
    $('#addUser').click(function () {
        addUser();
    });
    $('#addEvent').click(function () {
        addEvent();
    });
    $('#addOpnote').click(function () {
        addOpnote();
    });

    // settings table
    settingsTabulator = new Tabulator("#settingsTable", {
        layout: "fitColumns",
        index: '_id',
        cellEdited: function (cell) {
            var row = cell.getRow().getData();
            delete row.username;
            socket.send(JSON.stringify({
                act: 'update_mission_user',
                arg: row,
                msgId: msgHandler()
            }));
        },
        columns: [{
                title: '_id',
                field: '_id',
                visible: false
            },
            {
                title: 'User ID',
                field: 'user_id',
                visible: false
            },
            {
                title: 'Username',
                field: 'username'
            },
            {
                title: 'Manage Users',
                field: 'permissions.manage_users',
                formatter: 'tickCross',
                align: 'center',
                cellClick:function(e, cell) {
                    cell.setValue(!cell.getValue());
                }
            },
            {
                title: 'Write Access',
                field: 'permissions.write_access',
                formatter: 'tickCross',
                align: 'center',
                cellClick:function(e, cell) {
                    cell.setValue(!cell.getValue());
                }
            },
            {
                title: 'Delete Access',
                field: 'permissions.delete_access',
                formatter: 'tickCross',
                align: 'center',
                cellClick:function(e, cell) {
                    cell.setValue(!cell.getValue());
                }
            },
            {
                title: 'API Access',
                field: 'permissions.api_access',
                formatter: 'tickCross',
                align: 'center',
                cellClick:function(e, cell) {
                    cell.setValue(!cell.getValue());
                }
            },
            {
                headerSort: false,
                formatter: 'buttonCross',
                width: 40,
                align: 'center',
                cellClick: function (e, cell) {
                    socket.send(JSON.stringify({
                        act: 'delete_mission_user',
                        arg: {
                            _id: cell.getRow().getData()['_id']
                        },
                        msgId: msgHandler()
                    }));
                }
            },
        ]
    });

    // events table
    eventsTabulator = new Tabulator("#eventsTable", {
        layout: "fitColumns",
        index: '_id',
        selectable: 'highlight',
        cellEdited: function (cell) {
            var row = cell.getRow().getData();
            row = cleanupRow(row);
            delete row.username;
            delete row.user_id;
            socket.send(JSON.stringify({
                act: 'update_event',
                arg: row,
                msgId: msgHandler()
            }));
        },
        columns: [{
                title: '_id',
                field: '_id',
                visible: false
            },
            {
                title: 'Discovery Time',
                field: 'discovery_time',
                editor: dateEditor,
                editable: function() { return permissions.write_access }
            },
            {
                title: 'Event Time',
                field: 'event_time',
                editor: dateEditor,
                editable: function() { return permissions.write_access }
            },
            {
                title: 'Source',
                field: 'source_object',
                editor: 'select',
                editable: function() { return permissions.write_access },
                editorParams: function () {
                    objectSelect.sort(sortByName);

                    var vals = {};
                    for (var i = 0; i < objectSelect.length; i++) {
                        vals[objectSelect[i]._id] = objectSelect[i].name;
                    }
                    return {
                        values: vals
                    }
                },
                formatter: function (cell, formatterParams, onRendered) {
                    if (cell.getValue() !== undefined && cell.getValue()) {
                        var res = objectSelect.find(obj => obj._id == cell.getValue());
                        if (res && res.name) {
                            return res.name;
                        } else {
                            return 'OBJECT DELETED';
                        }
                    } else {
                        return ''
                    }
                }
            },
            {
                title: 'Destination',
                field: 'dest_object',
                editor: 'select',
                editable: function() { return permissions.write_access },
                editorParams: function () {
                    objectSelect.sort(sortByName);

                    var vals = {};
                    for (var i = 0; i < objectSelect.length; i++) {
                        vals[objectSelect[i]._id] = objectSelect[i].name;
                    }
                    return {
                        values: vals
                    }
                },
                formatter: function (cell, formatterParams, onRendered) {
                    if (cell.getValue() !== undefined && cell.getValue()) {
                        var res = objectSelect.find(obj => obj._id == cell.getValue());
                        if (res && res.name) {
                            return res.name;
                        } else {
                            return 'OBJECT DELETED';
                        }
                    } else {
                        return ''
                    }
                }
            },
            {
                title: 'Type',
                field: 'event_type',
                editor: 'input',
                editable: function() { return permissions.write_access }
            },
            {
                title: 'Description',
                field: 'short_desc',
                editor: 'textarea',
                formatter: 'textarea',
                editable: function() { return permissions.write_access }
            },
            {
                title: 'User',
                field: 'username'
            },
            {
                headerSort: false,
                formatter: 'buttonCross',
                width: 40,
                align: 'center',
                cellClick: function (e, cell) {
                    if (!permissions.write_access) {
                        return false;
                    }
                    socket.send(JSON.stringify({
                        act: 'delete_event',
                        arg: {
                            _id: cell.getRow().getData()['_id']
                        },
                        msgId: msgHandler()
                    }));
                }
            }
        ]
    });

    // opnotes table
    opnotesTabulator = new Tabulator("#opnotesTable", {
        layout: "fitColumns",
        index: '_id',
        cellEdited: function (cell) {
            var row = cell.getRow().getData();
            row = cleanupRow(row);
            delete row.username;
            delete row.user_id;
            socket.send(JSON.stringify({
                act: 'update_opnote',
                arg: row,
                msgId: msgHandler()
            }));
        },
        columns: [{
                title: '_id',
                field: '_id',
                visible: false
            },
            {
                title: 'Opnote Time',
                field: 'opnote_time',
                editor: dateEditor,
                editable: function() { return permissions.write_access }
            },
            {
                title: 'Target',
                field: 'target',
                editor: 'input',
                editable: function() { return permissions.write_access }
            },
            {
                title: 'Tool',
                field: 'tool',
                editor: 'input',
                editable: function() { return permissions.write_access }
            },
            {
                title: 'Action',
                field: 'action',
                editor: 'textarea',
                editable: function() { return permissions.write_access }
            },
            {
                title: 'User',
                field: 'username'
            },
            {
                headerSort: false,
                formatter: 'buttonCross',
                width: 40,
                align: 'center',
                cellClick: function (e, cell) {
                    if (!permissions.write_access) {
                        return false;
                    }
                    socket.send(JSON.stringify({
                        act: 'delete_opnote',
                        arg: {
                            _id: cell.getRow().getData()['_id']
                        },
                        msgId: msgHandler()
                    }));
                }
            },
        ]
    });

    // ---------------------------- BUTTONS ----------------------------------
    $('#zoomInButton').click(function () {
        zoomIn();
    });

    $('#zoomOutButton').click(function () {
        zoomOut();
    });

    $('#objectSearch').change(function () {
        objectSearch(this.value)
    });

    $('#nextObjectSearch').click(function () {
        nextObjectSearch();
    });

    $('#prevObjectSearch').click(function () {
        prevObjectSearch();
    });

    $('#downloadEventsButton').click(function () {
        downloadEvents();
    });

    $('#downloadDiagramButton').click(function () {
        downloadDiagram(this);
    });

    $('#downloadOpnotesButton').click(function () {
        downloadOpnotes();
    });

    $('#timelineBack').click(function() {
        timelineAdvance(-1);
    })

    $('#timelineCancel').click(function() {
        timelineCancel();
    })

    $('#timelineForward').click(function() {
        timelineAdvance(1);
    })

    // ---------------------------- WINDOW MANAGER ----------------------------------
    windowManager = new WindowManager({
        container: "#windowPane",
        windowTemplate: $('#details_template').html()
    });

    // ---------------------------- MISC ----------------------------------
    $('#diagram').mousedown(startPan);

    $('[name="propFillColor"]').paletteColorPicker({
        colors: [
            {'#000000': '#000000'},
            {'#808080': '#808080'},
            {'#c0c0c0': '#c0c0c0'},
            {'#ffffff': '#ffffff'},
            {'#800000': '#800000'},
            {'#ff0000': '#ff0000'},
            {'#808000': '#808000'},
            {'#ffff00': '#ffff00'},
            {'#008000': '#008000'},
            {'#00ff00': '#00ff00'},
            {'#008080': '#008080'},
            {'#00ffff': '#00ffff'},
            {'#000080': '#000080'},
            {'#0000ff': '#0000ff'},
            {'#800080': '#800080'},
            {'#ff00ff': '#ff00ff'}  
        ],
        clear_btn: null,
        position: 'upside',
        timeout: 2000,
        close_all_but_this: true,
        onchange_callback: function (color) {
            if (color !== $('#propFillColor').val())
                updatePropFillColor(color);
        }
    });
    $('[name="propStrokeColor"]').paletteColorPicker({
        colors: [
            {'#000000': '#000000'},
            {'#808080': '#808080'},
            {'#c0c0c0': '#c0c0c0'},
            {'#ffffff': '#ffffff'},
            {'#800000': '#800000'},
            {'#ff0000': '#ff0000'},
            {'#808000': '#808000'},
            {'#ffff00': '#ffff00'},
            {'#008000': '#008000'},
            {'#00ff00': '#00ff00'},
            {'#008080': '#008080'},
            {'#00ffff': '#00ffff'},
            {'#000080': '#000080'},
            {'#0000ff': '#0000ff'},
            {'#800080': '#800080'},
            {'#ff00ff': '#ff00ff'}  
        ],
        position: 'upside',
        timeout: 2000, // default -> 2000
        close_all_but_this: true,
        onchange_callback: function (color) {
            if (color !== $('#propStrokeColor').val())
                updatePropStrokeColor(color);
        }
    });

    // make the diagram resizable
    $("#diagramJumbo").resizable({
        handles: 's',
        minHeight: 350
    });

    $("#bottomJumbo").resizable({
        handles: 's',
        minHeight: 350
    });

    $("#toolbarBody").resizable({
        handles: 'w',
        maxWidth: $('#diagramJumbo').width() - 60
    });

    // resize event to resize toolbar
    $('#diagramJumbo').on('resize', function (event, ui) {
        if (ui.size.height === ui.originalSize.height) {
            return;
        }
        clearTimeout(resizeTimer);
        resizeTimer = setTimeout(function () {
            settings.diagram = Math.round($('#diagramJumbo').height());
            updateSettings();
            resizeCanvas();
        }, 100);
    });

    // resize event to resize canvas
    $('#toolbarBody').on('resize', function (event, ui) {
        clearTimeout(resizeTimer);
        resizeTimer = setTimeout(function () {
            settings.toolbar = Math.round($('#toolbarBody').width());
            updateSettings();
        }, 100);
    });

    $('#bottomJumbo').on('resize', function (event, ui) {
        clearTimeout(resizeTimer);
        resizeTimer = setTimeout(function () {
            settings.tables = Math.round($('#bottomJumbo').height());
            updateSettings();
        }, 100);
    });

    // on window resize, resize the canvas
    window.addEventListener('resize', function () {
        clearTimeout(resizeTimer);
        resizeTimer = setTimeout(function () {
            resizeCanvas();
        }, 100);
    }, false);

    // capture keys
    window.addEventListener("keydown", function (e) {
        // copy
        if (lastClick === canvas.upperCanvasEl) {
            if (e.ctrlKey && (e.keyCode === 'c'.charCodeAt(0) || e.keyCode === 'C'.charCodeAt(0))) {
                canvasClipboard = [];
                o = canvas.getActiveObjects();

                var x = 0;
                var y = 0;

                for (var i = 0; i < o.length; i++) {
                    if (o.length === 1) {
                        x = 0 - o[i].width / 2;
                        y = 0 - o[i].height / 2;
                    } else {
                        x = o[i].left;
                        y = o[i].top;
                    }
                    canvasClipboard.push({
                        _id: o[i]._id,
                        x: x,
                        y: y,
                        z: Math.round(canvas.getObjects().indexOf(o[i] / 2))
                    });
                }

                // paste
            } else if (e.ctrlKey && (e.keyCode === 'v'.charCodeAt(0) || e.keyCode === 'V'.charCodeAt(0))) {
                if (canvasClipboard.length > 0)
                    pasteObjects();

                // delete
            } else if (e.keyCode === 46) {
                if (canvas.getActiveObject())
                    deleteObjectConfirm();

                // arrows
            } else if (e.keyCode >= 37 && e.keyCode <= 40 && canvas.getActiveObject()) {
                var o = canvas.getActiveObject();
                if (objectMovingTimer)
                    window.clearTimeout(objectMovingTimer);
                objectMovingTimer = setTimeout(function () {
                    objectModified(o);
                }, 1000);
                switch (e.keyCode) {
                    case 37:
                        o.left -= 1;
                        break;
                    case 38:
                        o.top -= 1;
                        break;
                    case 39:
                        o.left += 1;
                        break;
                    case 40:
                        o.top += 1;
                        break;
                }
                objectMoving(o, 0);
                o.setCoords();
                canvas.requestRenderAll();

                // search (ctrl + f)
            } else if (e.keyCode === 114 || (e.ctrlKey && e.keyCode === 70)) {
                e.preventDefault();
                if (!$('#objectSearchBar').is(':visible')) {
                    $('#objectSearchBar').show().css('display', 'table');
                    $('#objectSearch').focus();
                } else {
                    $('#foundCount').hide();
                    $('#objectSearchBar').hide();
                    $('#objectSearch').val('');
                }
            }
        }
    })

    // set focus to diagram
    $('#diagramJumbo').focus();

    // load settings from cookie
    loadSettings();
    resizeCanvas();

    // ---------------------------- DIAGRAM SOCKET STUFF ----------------------------------
    socket.onopen = function () {
        socket.pingInterval = setInterval(function ping() {
            socket.send(JSON.stringify({
                act: 'ping',
                arg: '',
                msgId: msgHandler()
            }));
        }, 10000);

        // after connect, send join request
        setTimeout(function () {
            console.log('connect');
            console.log('joining mission: ' + mission_id);
            socket.send(JSON.stringify({
                act: 'join',
                arg: {
                    mission_id: mission_id
                },
                msgId: msgHandler()
            }));
        }, 100);
    };

    // message handler
    socket.onmessage = function (msg) {
        msg = JSON.parse(msg.data);
        switch (msg.act) {
            // general
            case 'ack':
                clearTimeout(pendingMsg[msg.arg]);
                delete pendingMsg[msg.arg];
                break;

            case 'error':
                $('#modal-close').hide();
                $('#modal-header').html('Error!');
                $('#modal-body').html('<p>' + msg.arg.text + '</p>');
                $('#modal-footer').html('');
                $('#modal-content').removeAttr('style');
                $('#modal-content').removeClass('modal-details');
                $('#modal').removeData('bs.modal').modal({});
                break;

                // getters
            case 'join':
                // objects

                break;

            case 'get_objects':
                objectsLoaded = [];
                objectSelect = [{ _id: '', name: '' }];
                var objects = msg.arg;
                for (var o in objects) {
                    if (objects[o].type !== 'link' && objects[o].name !== '') {
                        objectSelect.push({
                            _id: objects[o]._id,
                            name: objects[o].name.split('\n')[0]
                        });
                    }
                    if (objects[o].type === 'icon' && SVGCache[objects[o].image] === undefined && objects[o].image !== undefined && objects[o].image !== null) {
                        SVGCache[objects[o].image] = null;
                        objectsLoaded.push(false);
                        getIcon(objects[o].image);
                    }
                }
                checkIfShapesCached(objects);
                break;


            case 'get_opnotes':
                opnotesTabulator.setData(msg.arg);
                break;

            case 'get_users':
                userSelect = msg.arg;
                break;

                // chat
            case 'get_chats':
                addChatMessage(msg.arg, true, true);
                break;

            case 'bulk_chat':
                addChatMessage(msg.arg, true);
                break;

            case 'chat':
                addChatMessage(msg.arg);
                break;
            
            case 'get_channels':
            case 'insert_chat_channel':
                addChatChannels(msg.arg)

                // events
            case 'get_events':
                eventsTabulator.setData(msg.arg);
                break;

            case 'insert_event':
                eventsTabulator.addRow(msg.arg);
                break;

            case 'update_event':
                eventsTabulator.updateRow(msg.arg._id, msg.arg);
                break;

            case 'delete_event':
                eventsTabulator.deleteRow(msg.arg);
                break;

            // opnotes
            case 'get_events':
                eventsTabulator.setData(msg.arg);
                break;

            case 'insert_opnote':
                console.log(msg);
                opnotesTabulator.addRow(msg.arg);
                break;

            case 'update_opnote':
                opnotesTabulator.updateRow(msg.arg._id, msg.arg);
                break;

            case 'delete_opnote':
                opnotesTabulator.deleteRow(msg.arg);
                break;

                // files
            case 'get_files':
                addFiles(msg.arg);
                break;

            case 'insert_file':
                addFiles([msg.arg]);
                break;

            case 'update_file':
                var node = $('#files').jstree(true).get_node(msg.arg._id);
                if (node && node.text !== msg.arg.name) {
                    $('#files').jstree(true).rename_node(msg.arg._id, msg.arg.name);
                }
                if (node && node.parent !== msg.arg.parent) {
                    $('#files').jstree(true).move_node(msg.arg._id, msg.arg.parent);
                }
                break;
    
            case 'delete_file':
                $('#files').jstree(true).delete_node(msg.arg);
                break;

                // notes
            case 'get_notes':
                addNotes(msg.arg);
                break;

            case 'insert_note':
                addNotes([msg.arg]);
                break;

            case 'update_note':
                $('#notes').jstree(true).rename_node(msg.arg._id, msg.arg.name);
                break;

            case 'delete_note':
                $('#notes').jstree(true).delete_node(msg.arg);
                break;

                // users
            case 'get_mission_users':
                settingsTabulator.setData(msg.arg);
                break;

            case 'insert_mission_user':
                settingsTabulator.addRow(msg.arg);
                break;

            case 'update_mission_user':
                settingsTabulator.updateRow(msg.arg._id, msg.arg);
                break;

            case 'delete_mission_user':
                settingsTabulator.deleteRow(msg.arg);
                break;

                // objects
            case 'change_object':
                var o = msg.arg;
                for (var i = 0; i < objectSelect.length; i++) {
                    // change name
                    if (objectSelect[i]._id === o._id && objectSelect[i].name !== o.name.split('\n')[0]) {
                        var node = $('#notes').jstree(true).get_node(o._id, true);
                        if (node) {
                            $('#notes').jstree().rename_node(o._id, o.name.split('\n')[0]);
                        }                        
                        objectSelect[i].name = o.name.split('\n')[0];
                        break;
                    }
                }

                var selected = '';
                for (var i = 0; i < canvas.getObjects().length; i++) {
                    if (canvas.item(i)._id === o._id) {
                        var to = canvas.item(i);
                        if (to === canvas.getActiveObject()) {
                            updatingObject = true;
                            selected = 'single';
                            if (canvas.getActiveObjects().length > 1) {
                                selected = 'group';
                                canvas.getActiveObjects().remove(to);
                            }
                        }
                        if (o.type === 'icon') {
                            var old_children = [];
                            for (var k = 0; k < to.children.length; k++) {
                                if (to.children[k].objType === 'link')
                                    old_children.push(to.children[k]);
                                if (to.children[k].objType === 'name')
                                    canvas.remove(to.children[k]);
                            }
                            canvas.remove(to);
                            cb = function () {
                                for (k = 0; k < old_children.length; k++) {
                                    updateLink(old_children[k]);
                                }
                            }
                            addObjectToCanvas(o, selected, cb);
                            canvas.requestRenderAll();
                        } else if (o.type === 'shape' || o.type === 'link') {
                            setObjectLock(canvas.item(i), o.locked);
                            if (o.type === 'link' && o.stroke_color === '') // don't let links disappear
                                o.stroke_color = '#000000';
                            if (canvas.item(i).name_val !== o.name) {
                                console.log('renaming');
                                canvas.item(i).name_val = o.name;
                                for (var k = 0; k < to.children.length; k++) {
                                    if (canvas.item(i).children[k].objType === 'name') {
                                        canvas.item(i).children[k].set('text', o.name);
                                    }
                                }
                            }
                            canvas.item(i).set('stroke', o.stroke_color);
                            canvas.item(i).set('fill', o.fill_color);
                            canvas.item(i).set('dirty', true);
                            canvas.requestRenderAll();
                        }
                        updatingObject = false;
                        break;
                    }
                }
                break;

            case 'move_object':
                for (var h = 0; h < msg.arg.length; h++) {
                    var o = msg.arg[h];
                    for (var i = 0; i < canvas.getObjects().length; i++) {
                        if (canvas.item(i)._id == o._id) {
                            var obj = canvas.item(i);
                            obj.dirty = true;

                            if (obj.objType !== 'link') {
                                obj.set('angle', o.rot);
                                if (obj.objType === 'shape') {
                                    obj.set('width', o.scale_x);
                                    obj.set('height', o.scale_y);
                                } else if (obj.objType === 'icon') {
                                    obj.set('scaleX', o.scale_x);
                                    obj.set('scaleY', o.scale_y);
                                }
                                var tmod = 0;
                                var lmod = 0;
                                if (canvas.getActiveObjects().length > 1 && canvas.getActiveObjects().indexOf(obj) > -1) {
                                    canvas.getActiveObject().removeWithUpdate(obj);
                                }
                                obj.set({
                                    left: o.x,
                                    top: o.y
                                });
                                for (var j = 0; j < obj.children.length; j++) {
                                    if (obj.children[j].objType === 'name') {
                                        obj.children[j].set('top', tmod + obj.top + obj.height * obj.scaleY + 4);
                                        obj.children[j].set('left', lmod + obj.left + (obj.width * obj.scaleX) / 2);
                                        obj.children[j].setCoords();
                                    } else if (obj.children[j].objType === 'link') {
                                        drawLink(obj.children[j]);
                                    }
                                }
                                obj.setCoords();
                            }
                            if (o.z !== undefined && i !== o.z * 2) {
                                if (i < o.z * 2) {
                                    obj.moveTo((o.z) * 2 + 1);
                                    for (var k = 0; k < obj.children.length; k++) {
                                        if (obj.children[k].objType === 'name') {
                                            obj.children[k].moveTo(canvas.getObjects().indexOf(obj));
                                        }
                                    }
                                } else {
                                    obj.moveTo(o.z * 2);
                                    for (var k = 0; k < obj.children.length; k++) {
                                        if (obj.children[k].objType === 'name') {
                                            obj.children[k].moveTo(canvas.getObjects().indexOf(obj) + 1);
                                        }
                                    }
                                }
                            }
                            break;
                        }
                    }
                }
                canvas.requestRenderAll();
                updateMinimapBg();
                break;

            case 'insert_object':
                for (var h = 0; h < msg.arg.length; h++) {
                    var o = msg.arg[h];
                    if (o.objType !== 'link') {
                        objectSelect.push({ _id: o._id, name: o.name.split('\n')[0] });
                        addNotes([{ _id: o._id, name: o.name.split('\n')[0], type: 'object' }]);
                    }
                    addObjectToCanvas(o, false);
                }
                updateMinimapBg();
                break;

            case 'delete_object':
                var _id = msg.arg;
                var node = $('#notes').jstree(true).get_node(_id, true);
                if (node) {
                    $('#notes').jstree(true).delete_node(node);
                }
                for (var i = 0; i < canvas.getObjects().length; i++) {
                    if (canvas.item(i)._id == _id) {
                        var object = canvas.item(i);
                        if (canvas.item(i).children !== undefined) {
                            for (var k = 0; k < object.children.length; k++) {
                                if (object.children[k].objType === 'name')
                                    canvas.remove(object.children[k]);
                            }
                        }
                        if (canvas.getActiveObjects().indexOf(object) > 1)
                            canvas.getActiveObject().removeWithUpdate(object);
                        canvas.remove(object);
                        break;
                    }
                }
                updateMinimapBg();
                canvas.requestRenderAll();
                break;
        }
    };

    socket.onclose = function () {
        canvas.clear();
        canvas.requestRenderAll();
        clearInterval(socket.pingInterval);
        $('#modal-close').hide();
        $('#modal-title').text('Attention!');
        $('#modal-body').html('<p>Connection lost! Please refesh the page to retry!</p>');
        $('#modal-footer').html('');
        $('#modal-content').removeAttr('style');
        $('#modal-content').removeClass('modal-details');
        $('#modal').removeData('bs.modal').modal({
            backdrop: 'static',
            keyboard: false
        });
    };

    
});