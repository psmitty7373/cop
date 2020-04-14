function getParameterByName(name, url) {
    if (!url) url = window.location.href;
    name = name.replace(/[\[\]]/g, "\\$&");
    var regex = new RegExp("[?&]" + name + "(=([^&#]*)|&|#|$)"),
        results = regex.exec(url);
    if (!results) return null;
    if (!results[2]) return '';
    return decodeURIComponent(results[2].replace(/\+/g, " "));
}
var mission_id = getParameterByName('mission');

// ---------------------------- PERMISSIONS & BUTTONS ----------------------------------
if (!permissions) {
    permissions = {
        manage_users: false,
        write_access: false,
        delete_access: false,
        api_access: false
    };
}

// ---------------------------- GLOBALS ----------------------------------
var settings = {
    'zoom': 1.0,
    'x': Math.round($('#diagramJumbo').width() / 2),
    'y': Math.round(700 / 2),
    'diagram': 700,
    'toolbar': 400,
    'tables': 350
};
var userSelect = [];
var missionUserSelect = [{ _id: '', user_id: '', username: '' }];
var objectsLoaded = null;
var socket;
var resizeTimer = null;
var updateSettingsTimer = null;

var lastClick = null;
var msgId = 0;
var pendingMsg = [];
var windowManager = null;
var settingsTabulator;
var timeline = null;
var timelinePosition = null;
var hasFocus = true;
var presence = {};
var eventsTabulator;
var opnotesTabulator;

var idleState = 'online';
var idleTime = 0;

var wsdb;

// ---------------------------- SETTINGS COOKIE ----------------------------------
function loadSettings() {
    if (decodeURIComponent(document.cookie) === '') {
        document.cookie = "mcscop-settings=" + JSON.stringify(settings);
    }
    var dc = decodeURIComponent(document.cookie);
    try {
        settings = JSON.parse(dc.split('mcscop-settings=')[1]);
    } catch (err) {
        document.cookie = "mcscop-settings=" + JSON.stringify(settings);
    }
    $('#diagramJumbo').height(settings.diagram);
    $('#bottomJumbo').height(settings.tables);
    /*
    canvas.setZoom(settings.zoom);
    canvas.relativePan({
        x: settings.x,
        y: settings.y
    });
    */
}

function updateSettings() {
    if (updateSettingsTimer)
        window.clearTimeout(updateSettingsTimer);
    updateSettingsTimer = setTimeout(function () {
        document.cookie = "mcscop-settings=" + JSON.stringify(settings);
    }, 100);
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

function sortByName(a, b) {
    return a.name.localeCompare(b.name);
}

function sortByUsername(a, b) {
    return a.username.localeCompare(b.username);
}

function timelineCancel() {
    $('#message').hide();
    graphRemoveHighlights();
    eventsTabulator.deselectRow();
    timeline = null;
    timelinePosition = 0;
}

function timelineAdvance(offset) {
    // remove highlights
    graphRemoveHighlights();

    // deslect any selected rows
    eventsTabulator.deselectRow();

    // advance timeline
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

    // highlight, show message, etc
    if (timeline) {
        var row = timeline[timelinePosition].getData();
        eventsTabulator.selectRow(row._id);

        if (row.source_object) {
            graphHighlightCellById(row.source_object);
        }

        if (row.dest_object) {
            graphHighlightCellById(row.dest_object);
        }

        $('#message').html('<span class="messageHeader">' + row.event_time + '</span><br/><span class="messageBody">' + row.short_desc.replace('\n','<br>') + '</span>');
        $('#message').show();
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
    graphCellsSelect.sort(sortByName);
    missionUserSelect.sort(sortByUsername);

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

    for (var i = 0; i < graphCellsSelect.length; i++) {
        msg += '<option value="' + graphCellsSelect[i]._id + '">' + graphCellsSelect[i].name + '</option>';
    }

    msg += `
            </select>
        </div>
    </div>
    <div class="form-group row">
        <label for="neDestObject" class="col-sm-4 col-form-label">Destination:</label>
        <div class="col-sm-8">
            <select class="form-control" id="neDestObject">`;

    for (var i = 0; i < graphCellsSelect.length; i++) {
        msg += '<option value="' + graphCellsSelect[i]._id + '">' + graphCellsSelect[i].name + '</option>';
    }

    msg += `
            </select>
        </div>
    </div>
    <div class="form-group row">
        <label for="neAssignedUserId" class="col-sm-4 col-form-label">Assigned User:</label>
        <div class="col-sm-8">
            <select class="form-control" id="neAssignedUserId">`;

    for (var i = 0; i < missionUserSelect.length; i++) {
        msg += '<option value="' + missionUserSelect[i].user_id + '">' + missionUserSelect[i].username + '</option>';
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
                    event.assigned_user_id = $('#neAssignedUserId').val();
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
    graphCellsSelect.sort(sortByName);

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

    return editor;
}

function deleteMissionUser(id) {
    socket.send(JSON.stringify({
        act: 'delete_mission_user',
        arg: {
            _id: id
        },
        msgId: msgHandler()
    }));
}

function deleteOpnote(id) {
    socket.send(JSON.stringify({
        act: 'delete_opnote',
        arg: {
            _id: id
        },
        msgId: msgHandler()
    }));
}

function deleteEvent(id) {
    socket.send(JSON.stringify({
        act: 'delete_event',
        arg: {
            _id: id
        },
        msgId: msgHandler()
    }));
}

function idleIncrement() {
    console.log(idleTime);
    if (idleTime === 5 && idleState === 'online') { 
        socket.send(JSON.stringify({
            act: 'update_user_status',
            arg: {
                status: 'idle'
            },
            msgId: msgHandler()
        }));
        idleState = 'idle';
    } else if (idleTime === 0 && idleState === 'idle') {
        socket.send(JSON.stringify({
            act: 'update_user_status',
            arg: {
                status: 'online'
            },
            msgId: msgHandler()
        }));
        idleState = 'online';
    }
    idleTime = idleTime + 1;
}

// READY!
$(window).on('load', function () {
    // scrollbars
    $('#toolsForm').overlayScrollbars({
        className: "os-theme-light"
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
    $('.tableBody').overlayScrollbars({
        className: "os-theme-light"
    });
    $('#channels').overlayScrollbars({
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
        wsdb = new WebSocket('wss://' + window.location.host + '/sharedb/');
    } else {
        socket = new WebSocket('ws://' + window.location.host + '/mcscop/');
        wsdb = new WebSocket('ws://' + window.location.host + '/sharedb/');
    }
    
    // ---------------------------- TABLES ----------------------------------   
    // bottom table tabs
    $('#chatTab').click(function () {
        tableToggle('chat');
    });
    if (permissions.manage_users) {
        $('#settingsTab').show();
        $('#settingsTabTag').show();
    }

    // attach events to tab buttons
    $('#settingsTab').click(function () {
        tableToggle('settings');
    });
    $('#eventsTab').click(function () {
        tableToggle('events');
    });
    $('#opnotesTab').click(function () {
        tableToggle('opnotes');
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
                    deleteConfirm('deleteMissionUser(\'' + cell.getRow().getData()['_id'] + '\')');
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
                    graphCellsSelect.sort(sortByName);

                    var vals = {};
                    for (var i = 0; i < graphCellsSelect.length; i++) {
                        vals[graphCellsSelect[i]._id] = graphCellsSelect[i].name;
                    }
                    return {
                        values: vals
                    }
                },
                formatter: function (cell, formatterParams, onRendered) {
                    if (cell.getValue() !== undefined && cell.getValue()) {
                        var res = graphCellsSelect.find(obj => obj._id == cell.getValue());
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
                    graphCellsSelect.sort(sortByName);

                    var vals = {};
                    for (var i = 0; i < graphCellsSelect.length; i++) {
                        vals[graphCellsSelect[i]._id] = graphCellsSelect[i].name;
                    }
                    return {
                        values: vals
                    }
                },
                formatter: function (cell, formatterParams, onRendered) {
                    if (cell.getValue() !== undefined && cell.getValue()) {
                        var res = graphCellsSelect.find(obj => obj._id == cell.getValue());
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
                title: 'Assignment',
                field: 'assigned_user_id',
                editor: 'select',
                editable: function() { return permissions.write_access },
                editorParams: function () {
                    missionUserSelect.sort(sortByUsername);

                    var vals = {};
                    for (var i = 0; i < missionUserSelect.length; i++) {
                        vals[missionUserSelect[i].user_id] = missionUserSelect[i].username;
                    }
                    console.log(vals);
                    return {
                        values: vals
                    }
                },
                formatter: function (cell, formatterParams, onRendered) {
                    if (cell.getValue() !== undefined && cell.getValue()) {
                        var res = missionUserSelect.find(obj => obj.user_id == cell.getValue());
                        if (res && res.username) {
                            return res.username;
                        } else {
                            return 'USER DELETED';
                        }
                    } else {
                        return ''
                    }
                }
            },
            {
                title: 'User',
                field: 'username'
            }, {
                headerSort: false,
                formatter: 'buttonCross',
                width: 40,
                align: 'center',
                cellClick: function (e, cell) {
                    if (!permissions.write_access) {
                        return false;
                    }
                    deleteConfirm('deleteEvent(\'' + cell.getRow().getData()['_id'] + '\')');
                    
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
            }, {
                headerSort: false,
                formatter: 'buttonCross',
                width: 40,
                align: 'center',
                cellClick: function (e, cell) {
                    if (!permissions.write_access) {
                        return false;
                    }
                    deleteConfirm('deleteOpnote(\'' + cell.getRow().getData()['_id'] + '\')');
                }
            }
        ]
    });

    // ---------------------------- BUTTONS ----------------------------------
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
//            resizeCanvas();
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

    // set focus to diagram
    $('#diagramJumbo').focus();

    // load settings from cookie
    loadSettings();

    // ---------------------------- SHAREDB SOCKET STUFF ----------------------------------
    wsdb.onopen = function () {
        setTimeout(function () {
            console.log('joining sharedb: ' + mission_id);
            wsdb.send(JSON.stringify({
                act: 'join',
                arg: {
                    mission_id: mission_id
                }
            }));
        }, 100);
        
    };

    wsdb.onmessage = function (msg) {
        msg = JSON.parse(msg.data);
        switch (msg.act) {
            case 'ack':
                shareDBConnection = new ShareDB.Connection(wsdb);
                break;
        }
    };

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
    socket.onmessage = function (rawMsg) {
        var msgs = JSON.parse(rawMsg.data);
        if (!Array.isArray(msgs)) {
            msgs = [msgs];
        }
        for (var m = 0; m < msgs.length; m++) {
            var msg = msgs[m];
            switch (msg.act) {
                // general
                case 'ack':
                    clearTimeout(pendingMsg[msg.arg]);
                    delete pendingMsg[msg.arg];
                    break;

                case 'msg':
                    $('#modal-close').hide();
                    $('#modal-header').html(msg.arg.title);
                    $('#modal-body').html('<p>' + msg.arg.text + '</p>');
                    $('#modal-footer').html('');
                    $('#modal-content').removeAttr('style');
                    $('#modal-content').removeClass('modal-details');
                    $('#modal').removeData('bs.modal').modal({});
                    break;

                // getters
                case 'join':
                    break;

                // graph
                case 'update_graph':
                    graphExecuteChanges(model, msg.arg);
                    break;

                case 'get_graph':
                    graphLoad(msg.arg);
                    break;

                // users
                case 'get_users':
                    userSelect = msg.arg;
                    break;

                // chat
                case 'get_chats':
                    chatAddMessage(msg.arg, true, true);
                    break;

                case 'delete_chat':
                    chatDeleteMessage(msg.arg);
                    break;

                case 'bulk_chat':
                    chatAddMessage(msg.arg, true);
                    break;

                case 'chat':
                    chatAddMessage(msg.arg);
                    break;

                case 'update_chat':
                    chatUpdateMessage(msg.arg);
                    break;

                case 'update_user_status':
                    chatUpdateUserStatus(msg.arg);
                    break;
                
                case 'get_chat_channels':
                case 'insert_chat_channel':
                    chatAddChannels(msg.arg)
                    break;

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
                case 'get_opnotes':
                    opnotesTabulator.setData(msg.arg);
                    break;

                case 'insert_opnote':
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
                
                // presence
                case 'get_presence':
                    presence = msg.arg;
                    break;

                case 'insert_presence':
                    if (!presence[msg.arg.doc]) {
                        presence[msg.arg.doc] = {};
                    }

                    if (!presence[msg.arg.doc][msg.arg.user_id]) {
                        presence[msg.arg.doc][msg.arg.user_id] = msg.arg.presence;
                        notesInsertPresence(msg.arg.doc, msg.arg.user_id, msg.arg.presence.username);
                    }
                    break;

                case 'delete_presence':
                    if (presence[msg.arg.doc] && presence[msg.arg.doc][msg.arg.user_id]) {
                        delete presence[msg.arg.doc][msg.arg.user_id];
                        notesDeletePresence(msg.arg.doc, msg.arg.user_id);
                    }
                    break;

                // notes
                case 'get_notes':
                    notesTabulator.setData(msg.arg);
                    break;

                case 'insert_note':
                    notesTabulator.addRow(msg.arg);
                    break;

                case 'update_note':
                    notesTabulator.updateRow(msg.arg._id, msg.arg);
                    break;

                case 'delete_note':
                    notesTabulator.deleteRow(msg.arg);
                    break;

                // users
                case 'get_mission_users':
                    missionUserSelect = [{ _id: '', user_id: '', username: '' }];
                    for (var i = 0; i < msg.arg.length; i++) {
                        missionUserSelect.push({ _id: msg.arg[i]._id, user_id: msg.arg[i].user_id, username: msg.arg[i].username})
                    }
                    settingsTabulator.setData(msg.arg);
                    break;

                case 'insert_mission_user':
                    missionUserSelect.push({ _id: msg.arg.user_id, user_id: msg.arg.user_id, username: msg.arg.username})
                    settingsTabulator.addRow(msg.arg);
                    break;

                case 'update_mission_user':
                    settingsTabulator.updateRow(msg.arg._id, msg.arg);
                    break;

                case 'delete_mission_user':
                    for (i = 0; i < missionUserSelect.length; i++) {
                        if (missionUserSelect[i]._id === msg.arg) {
                            console.log('delete');
                            missionUserSelect.splice(i, 1);
                            break;
                        }
                    }
                    settingsTabulator.deleteRow(msg.arg);
                    break; 
            }
        }
    };

    socket.onclose = function () {
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

    // window focus tracking
    $(window).focus(function() {
        hasFocus = true;
        $('#favicon').attr('href', 'images/favicon.ico');
    });

    $(window).blur(function() {
        hasFocus = false;
    });

    // idle tracking
    $(window).mousemove(function () {
        idleTime = 0;
    });

    $(window).keypress(function () {
        idleTime = 0;
    });

    // start idle counter (5-min)
    setInterval(idleIncrement, 1000  * 60 * 5);

    $('body').tooltip({
        selector: '[data-toggle=tooltip]'
    });

    wsdb.onclose = socket.onclose;
   
});