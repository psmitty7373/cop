var socket;
var pendingMsg = [];
var msgId = 0;

if (!permissions)
    permissions = [];

function showModal(title, body, footer) {
    $('#modal-title').text(title);
    $('#modal-body').html('<p>' + body + '</p>');
    $('#modal-footer').html(footer);
    $('#modal').modal('show')
}

$("#changePassword").click(function(e) { e.preventDefault(); changePassword(); });
function changePassword() {
    if ($('#cpNew').val() !== $('#cpConfirm').val()) {
        $('#modal-title').text('Error!');
        $('#modal-body').html('<p>Passwords do not match, please try again.</p>');
        $('#modal-footer').html('');
        $('#modal').modal('show')
    } else {
        var data = {newpass: $('#cpNew').val()};
        $('#cpNew').val('');
        $('#cpConfirm').val('');
        $.ajax({
            url: 'api/change_password',
            type: 'POST',
            data: data,
            dataType: 'json',
            cache: false,
            success: function(resp) {
                if (resp == 'OK') {
                    $('#modal-title').text('Password Changed!');
                    $('#modal-body').html('<p>Password changed successfully!</p>');
                } else {
                    $('#modal-title').text('Error!');
                    $('#modal-body').html('<p>Error changing password, check values and try again.</p>');
                }
                $('#modal-footer').html('');
                $('#modal').modal('show')
            },
            error: function() {
                console.log('mission delete error');
            }
        });
    }
}

var _URL = window.URL || window.webkitURL;
var f = function(e)
{
    var srcElement = e.srcElement? e.srcElement : e.target;
    if ($.inArray('Files', e.dataTransfer.types) > -1)
    {
        e.stopPropagation();
        e.preventDefault();
        e.dataTransfer.dropEffect = ($(srcElement).hasClass('droppable')) ? 'copy' : 'none';
        if (e.type == 'drop') {
            if (e.dataTransfer.files.length > 1) {
                $('#modal-title').text('Upload Error!');
                $('#modal-body').html('<p>Sorry, only one file at a time!</p>');
                $('#modal-footer').html('');
                $('#modal').modal('show')
                return;
            }
            var formData = new FormData();
            var file = e.dataTransfer.files[0];
            formData.append('file',file);
            formData.append('id',e.target.id.split('_')[1]);
            var img = new Image();
            img.onload = function() {
                if (this.width > 72 || this.height > 72 || this.height !== this.width || file['type'] !== 'image/png') {
                    showModal('Image Error!', 'Sorry, avatars must be <= 72x72px, square, and in .png format.', '');
                } else {
                    $.ajax({
                        url: 'avatar',
                        type: 'POST',
                        data: formData,
                        dataType: 'json',
                        cache: false,
                        contentType: false,
                        processData: false,
                        success: function() {
                            e.target.src = 'images/avatars/' + e.target.id.split('_')[1] + '.png?' + new Date().getTime();
//                            $("#users").trigger("reloadGrid");
                        },
                        error: function() {
                            console.log('upload error');
                        }
                    });
                }
            };
            img.onerror = function() {
                showModal('Image Error!', 'Sorry, avatars must be <= 72x72px, square, and in .png format.', '');
            };
            img.src = _URL.createObjectURL(file);
        }
    }
};

function deleteRow(e, type, table, id) {
    e.stopPropagation();
    $.ajax({
        url: 'api/' + type,
        type: 'POST',
        data: {_id: id, table: table, oper: 'del'},
        dataType: 'json',
        cache: false,
        success: function(data) {
            $(table).jqGrid('delRowData', id);
        },
        error: function() {
        }
    });
}

function saveRow(e, type, table, id) {
    e.stopPropagation();
    lastSelection = null;
    var data = {};
    var oper = 'edit';
    if (id.indexOf('jqg') !== -1)
        oper = 'add';
    $(table).jqGrid('saveRow', id, {extraparam: {oper: oper}});
    $(table).trigger("reloadGrid");           
}

function cancelRow(e, type, table, id) {
    e.stopPropagation();
    lastSelection = null;
    e.stopPropagation();
    $(table).jqGrid('restoreRow', id);
    $(table).jqGrid('resetSelection');
}

// ---------------------------- SOCKET.IO MESSAGES / HANDLERS ----------------------------------
function msgHandler() {
    pendingMsg[msgId] = setTimeout(function() {
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
        $('#modal').removeData('bs.modal').modal({backdrop: 'static', keyboard: false});
    }, 30000);
    return msgId++; 
}

$(document).ready(function() {
    document.body.addEventListener('dragleave', f, false);
    document.body.addEventListener('dragover', f, false);
    document.body.addEventListener('drop', f, false);
    
    var users_rw = false;
    if (permissions.indexOf('all') !== -1 || permissions.indexOf('manage_users') !== -1) {
        users_rw = true;
        $('#usersJumbotron').show();
    }

    // ---------------------------- SOCKETS ----------------------------------
    if (location.protocol === 'https:') {
        socket = new WebSocket('wss://' + window.location.host + '/mcscop/');
        wsdb = new WebSocket('wss://' + window.location.host + '/mcscop/');
    } else {
        socket = new WebSocket('ws://' + window.location.host + '/mcscop/');
        wsdb = new WebSocket('ws://' + window.location.host + '/mcscop/');
    }

    socket.onopen = function() {
        socket.pingInterval = setInterval(function ping() {
            socket.send(JSON.stringify({ act: 'ping', arg: '', msgId: msgHandler() }));
        }, 10000);
        setTimeout(function() {
            console.log('connect');
            if (users_rw) {
                socket.send(JSON.stringify({ act:'get_users', arg: '', msgId: msgHandler() }));
            }
        }, 100);
    };

    // message handler
    socket.onmessage = function(msg) {
        msg = JSON.parse(msg.data);
        switch(msg.act) {
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
            
            case 'get_users':
                // missions
                usersTabulator.setData(msg.arg.users);
                break;
        }
    }
    if (users_rw) {
        usersTabulator = new Tabulator("#usersTable", {
            layout: "fitColumns",
            columns: [
                { title: 'User ID', field: '_id' },
                { title: 'Avatar', field: 'avatar' },
                { title: 'Username', field: 'username', editor: 'input'},
                { title: 'Name', field: 'name', editor: 'input' },
                { title: 'Password', field: 'password', editor: 'input' },
                { title: 'Permissions', field: 'permissions' }
            ]
        });





        

        /*
        $("#users").jqGrid({
            datatype: 'json',
            mtype: 'POST',
            url: 'api/users',
            editurl: 'api/users',
            autowidth: true,
            maxHeight: 600,
            height: 300,
            rowNum: -1,
            reloadAfterSubmit: true,
            colModel: [
                { label: ' ', template: 'actions', formatter: function(cell, options, row) {
                        var buttons = '<div title="Delete row" style="float: left;';
                        if (!users_rw)
                            buttons += ' display: none;';
                        buttons += '" class="ui-pg-div ui-inline-del" id="jDelButton_' + options.rowId + '" onclick="config.deleteRow(event, \'users\', \'#users\', \'' + options.rowId + '\')" onmouseover="jQuery(this).addClass(\'ui-state-hover\');" onmouseout="jQuery(this).removeClass(\'ui-state-hover\');"><span class="ui-icon ui-icon-trash"></span></div> <div title="Save row" style="float: left; display: none;" class="ui-pg-div ui-inline-save" id="jSaveButton_' + options.rowId + '" onclick="config.saveRow(event, \'users\', \'#users\', \'' + options.rowId + '\')" onmouseover="jQuery(this).addClass(\'ui-state-hover\');" onmouseout="jQuery(this).removeClass(\'ui-state-hover\');"><span class="ui-icon ui-icon-disk"></span></div><div title="Cancel row editing" style="float: left; display: none;" class="ui-pg-div ui-inline-cancel" id="jCancelButton_' + options.rowId + '" onclick="config.cancelRow(event, \'users\', \'#users\', \'' + options.rowId + '\')" onmouseover="jQuery(this).addClass(\'ui-state-hover\');" onmouseout="jQuery(this).removeClass(\'ui-state-hover\');"><span class="ui-icon ui-icon-cancel"></span></div>';
                        return buttons;
                    },
                    width: 15,
                    formatoptions: {
                        keys: true,
                    }
                },
                { label: '_id', name: '_id', key: true, editable: false, hidden: true },
                { label: 'Avatar', name: 'avatar', width: 53, fixed: true, editable: false, formatter: function (c, o, r) {
                        if (r.avatar !== null)
                            return '<img class="droppable avatar" id="avatar_' + r._id + '" src="images/avatars/' + r._id + '.png"/>';
                        else
                            return '<img class="droppable avatar" id="avatar_' + r._id + '" src="images/avatars/blank.png"/>';
                    }
                },
                { label: 'Username', name: 'username', width: 50, editable: users_rw, edittype: 'text' },
                { label: 'Name', name: 'name', width: 50, editable: users_rw, edittype: 'text' },
                { label: 'API Key', name: 'api', width: 85, editable: users_rw, edittype: 'text' },
                { label: 'Set Password', name: 'password', width: 50, editable: users_rw, edittype: 'password' },
                { label: 'System Permissions', name: 'permissions', width: 150, editable: users_rw, edittype: 'select', formatter: 'select', editoptions: {
                        value: {none: 'None', all:'All', manage_missions:'Manage Missions', delete_missions: 'Delete Missions', manage_users:'Manage Users' },
                        multiple: true,
                        size: 10
                    }
                }

            ],
            sortable: true,
            pager: '#usersPager',
            pgbuttons: false,
            pgtext: null,
            onSelectRow: function (id, r, e) {
                if (id && id !== lastSelection && users_rw) {
                    var grid = $("#users");
                    grid.jqGrid('restoreRow', lastSelection);
                    $("table#users tr#"+$.jgrid.jqID(id)+ " div.ui-inline-del").hide();
                    $("table#users tr#"+$.jgrid.jqID(id)+ " div.ui-inline-edit").hide();
                    $("table#users tr#"+$.jgrid.jqID(id)+ " div.ui-inline-save").show();
                    $("table#users tr#"+$.jgrid.jqID(id)+ " div.ui-inline-cancel").show();
                    lastSelection = id;
                    grid.jqGrid('editRow', id, {keys: true, successfunc: function () {
                            $("table#users tr#"+$.jgrid.jqID(lastSelection)+ " div.ui-inline-del").show();
                            $("table#users tr#"+$.jgrid.jqID(lastSelection)+ " div.ui-inline-edit").show();
                            $("table#users tr#"+$.jgrid.jqID(lastSelection)+ " div.ui-inline-save").hide();
                            $("table#users tr#"+$.jgrid.jqID(lastSelection)+ " div.ui-inline-cancel").hide();
                            $("#users").trigger("reloadGrid");
                            lastSelection = null;
                        },
                        afterrestorefunc: function (options) {
                            lastSelection = null;
                            $('#users').jqGrid('resetSelection');
                        }
                    });
                }
            },
        });
        $('#users').navGrid('#usersPager', {
            add: false,
            edit: false,
            del: false
        });
        $('#users').inlineNav('#usersPager', {
            edit: false,
            add: users_rw,
            del: false,
            cancel: false,
            save: false,
            addParams: {
                addRowParams: {
                    keys: true,
                    successfunc: function() {
                        $("#users").trigger("reloadGrid");
                    },
                    url: 'api/users'
                },
            }
        });
        $(window).bind("resize", function () {
            $("#users").jqGrid("setGridWidth", $("#users").closest(".jumbotron").width());
        }).triggerHandler("resize");

        */
    }
});