var socket;
var pendingMsg = [];
var msgId = 0;

if (!permissions)
    permissions = {
        manage_users: false,
        manage_missions: false
    };

function showModal(title, body, footer) {
    $('#modal-title').text(title);
    $('#modal-body').html('<p>' + body + '</p>');
    $('#modal-footer').html(footer);
    $('#modal').modal('show')
}

$("#changePassword").click(function (e) {
    e.preventDefault();
    changePassword();
});

function changePassword() {
    if ($('#cpNew').val() !== $('#cpConfirm').val()) {
        $('#modal-title').text('Error!');
        $('#modal-body').html('<p>Passwords do not match, please try again.</p>');
        $('#modal-footer').html('');
        $('#modal').modal('show')
    } else {
        var data = {
            newpass: $('#cpNew').val()
        };
        $('#cpNew').val('');
        $('#cpConfirm').val('');
        $.ajax({
            url: 'api/change_password',
            type: 'POST',
            data: data,
            dataType: 'json',
            cache: false,
            success: function (resp) {
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
            error: function () {
                console.log('mission delete error');
            }
        });
    }
}

var _URL = window.URL || window.webkitURL;
var f = function (e) {
    var srcElement = e.srcElement ? e.srcElement : e.target;
    if ($.inArray('Files', e.dataTransfer.types) > -1) {
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
            formData.append('file', file);
            formData.append('id', e.target.id.split('_')[1]);
            var img = new Image();
            img.onload = function () {
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
                        success: function () {
                            e.target.src = 'images/avatars/' + e.target.id.split('_')[1] + '.png?' + new Date().getTime();
                        },
                        error: function () {
                            console.log('upload error');
                        }
                    });
                }
            };
            img.onerror = function () {
                showModal('Image Error!', 'Sorry, avatars must be <= 72x72px, square, and in .png format.', '');
            };
            img.src = _URL.createObjectURL(file);
        }
    }
};

// ---------------------------- SOCKET.IO MESSAGES / HANDLERS ----------------------------------
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

function newUser() {
    var msg = '<form><div class="form-group row"><label for="nuUsername" class="col-sm-2 col-form-label">Username</label><div class="col-sm-10"><input type="text" class="form-control" id="nuUsername" value=""></div></div>';
    msg += '<div class="form-group row"><label for="nuName" class="col-sm-2 col-form-label">Name</label><div class="col-sm-10"><input type="text" class="form-control" id="nuName" value=""></div></div>';
    msg += '<div class="form-group row"><label for="nuPassword" class="col-sm-2 col-form-label">Password</label><div class="col-sm-10"><input type="password" class="form-control" id="nuPassword" placeholder="Password"></div></div>';
    msg += '<div class="form-check"><input type="checkbox" class="form-check-input" id="nuPermManageUsers"><label class="form-check-label" for="nuPermManageUsers">Manage Users</label></div>';
    msg += '<div class="form-check"><input type="checkbox" class="form-check-input" id="nuPermManageMissions"><label class="form-check-label" for="nuPermManageMissions">Manage Missions</label></div></form>';

    bootbox.dialog({
        message: msg,
        title: 'Insert New User',
        buttons: {
            confirm: {
                label: 'Insert',
                className: 'btn-primary',
                callback: function () {
                    var user = {};
                    user.username = $('#nuUsername').val();
                    user.name = $('#nuName').val();
                    user.password = $('#nuPassword').val();
                    user.permissions = {
                        manage_users: $('#nuPermManageUsers').is(":checked"),
                        manage_missions: $('#nuPermManageMissions').is(":checked")
                    }
                    socket.send(JSON.stringify({
                        act: 'insert_user',
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

$(document).ready(function () {
    document.body.addEventListener('dragleave', f, false);
    document.body.addEventListener('dragover', f, false);
    document.body.addEventListener('drop', f, false);

    if (permissions.manage_users) {
        $('#usersJumbotron').show();
    }

    // prevent bootbox from reloading on submit / enter
    $(document).on("submit", ".bootbox form", function (e) {
        e.preventDefault();
        $(".bootbox .btn-primary").click();
    });

    // ---------------------------- SOCKETS ----------------------------------
    // socket connection
    if (location.protocol === 'https:') {
        socket = new WebSocket('wss://' + window.location.host + '/mcscop/');
        wsdb = new WebSocket('wss://' + window.location.host + '/mcscop/');
    } else {
        socket = new WebSocket('ws://' + window.location.host + '/mcscop/');
        wsdb = new WebSocket('ws://' + window.location.host + '/mcscop/');
    }

    // socket onopen
    socket.onopen = function () {
        socket.pingInterval = setInterval(function ping() {
            socket.send(JSON.stringify({
                act: 'ping',
                arg: '',
                msgId: msgHandler()
            }));
        }, 10000);
        setTimeout(function () {
            console.log('connect');
            if (permissions.manage_users) {
                socket.send(JSON.stringify({
                    act: 'config',
                    arg: '',
                    msgId: msgHandler()
                }));
                socket.send(JSON.stringify({
                    act: 'get_users',
                    arg: '',
                    msgId: msgHandler()
                }));
            }
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

            case 'get_users':
                // missions
                usersTabulator.setData(msg.arg);
                break;

            case 'insert_user':
                usersTabulator.addRow(msg.arg);
                break;

            case 'update_user':
                usersTabulator.updateRow(msg.arg._id, msg.arg);
                break;

            case 'delete_user':
                usersTabulator.deleteRow(msg.arg);
                break;
        }
    }

    // user table
    $('#newUser').click(function () {
        newUser();
    });
    if (permissions.manage_users) {
        usersTabulator = new Tabulator("#usersTable", {
            layout: "fitColumns",
            index: '_id',
            cellEdited: function (cell) {
                socket.send(JSON.stringify({
                    act: 'update_user',
                    arg: cell.getRow().getData(),
                    msgId: msgHandler()
                }));
            },
            columns: [{
                    title: 'User ID',
                    field: '_id',
                    visible: false
                },
                {
                    title: 'Avatar',
                    field: 'avatar',
                    formatter: function (cell, formatterParams, onRendered) {
                        if (cell.getValue() !== null) {
                            return '<img class="droppable avatarSm" id="avatar_' + cell.getRow().getData()['_id'] + '" src="images/avatars/' + cell.getRow().getData()['_id'] + '.png"/>';
                        } else {
                            return '<img class="droppable avatarSm" id="avatar_' + cell.getRow().getData()['_id'] + '" src="images/avatars/blank.png"/>';
                        }
                    }
                },
                {
                    title: 'Username',
                    field: 'username'
                },
                {
                    title: 'Name',
                    field: 'name',
                    editor: 'input'
                },
                {
                    title: 'Password',
                    field: 'password',
                    editor: 'input'
                },
                {
                    title: 'Manage Missions',
                    field: 'permissions.manage_missions',
                    editor: 'tickCross',
                    formatter: 'tickCross',
                    align: 'center'
                },
                {
                    title: 'Manage Users',
                    field: 'permissions.manage_users',
                    editor: 'tickCross',
                    formatter: 'tickCross',
                    align: 'center'
                },
                {
                    headerSort: false,
                    formatter: 'buttonCross',
                    width: 40,
                    align: 'center',
                    cellClick: function (e, cell) {
                        socket.send(JSON.stringify({
                            act: 'delete_user',
                            arg: {
                                user_id: cell.getRow().getData()['_id']
                            },
                            msgId: msgHandler()
                        }));
                    }
                },
            ]
        });
    }
});