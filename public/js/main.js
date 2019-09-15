var socket;
var pendingMsg = [];
var msgId = 0;

function deleteRowConfirm(table, id) {
    $('#modal-title').text('Are you sure?');
    $('#modal-body').html('<p>Are you sure you want to delete this row?</p>');
    $('#modal-footer').html('<button type="button btn-primary" class="button btn btn-danger" data-dismiss="modal" onClick="main.deleteRow(\'' + table + '\', \'' + id + '\');">Yes</button> <button type="button btn-primary" class="button btn btn-default" data-dismiss="modal">No</button>');
    $('#modal-content').removeAttr('style');
    $('#modal-content').removeClass('modal-details');
    $('#modal').modal('show')
}

function deleteRow(table, id) {
    $(table).jqGrid('delRowData', id);
    var data = { oper: 'del', _id: id }
    $.ajax({
        url: 'api/missions',
        type: 'POST',
        data: data,
        dataType: 'json',
        cache: false,
        success: function() {
        },
        error: function() {
            console.log('mission delete error');
        }
    });
}

var lastSelection = null;
if (!permissions)
    permissions = [];

function getDate() {
    var date = new Date();
    return date.getFullYear() + '-' + addZero(date.getMonth()+1) + '-' + addZero(date.getDate()) + ' ' + addZero(date.getHours()) + ':' + addZero(date.getMinutes()) + ':' + addZero(date.getSeconds()) + '.' + date.getMilliseconds();
}

function getKeyByValue(object, value) {
    return Object.keys(object).find(key => object[key] === value);
}

function dateStringToEpoch(value) {
    var parts = value.match(/(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2}):(\d{2})\.(\d+)/);
    return(Date.UTC(parts[1], parts[2]-1, parts[3], parts[4], parts[5], parts[6], parts[7]));
}

function epochToDateString(value){
    if (isNaN(value))
        return value;
    var date = new Date(parseInt(value));
    return (date.getFullYear() + '-' + addZero(date.getMonth()+1) + '-' + addZero(date.getDate()) + ' ' + addZero(date.getHours()) + ':' + addZero(date.getMinutes()) + ':' + addZero(date.getSeconds()) + '.' + date.getMilliseconds());
}

function addZero(i) {
    if (i < 10) {
        i = "0" + i;
    }
    return i;
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
    var missions_rw = false;
    var delete_missions = false;
    if (permissions.indexOf('all') !== -1 || permissions.indexOf('manage_missions') !== -1)
        missions_rw = true;
    if (permissions.indexOf('all') !== -1 || permissions.indexOf('delete_missions') !== -1)
        delete_missions = true;

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
//            socket.send(JSON.stringify({ act:'join', arg: {mission_id: mission_id}, msgId: msgHandler() }));
            socket.send(JSON.stringify({ act:'get_missions', arg: '', msgId: msgHandler() }));
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
            
            case 'get_missions':
                // missions
                missionsTabulator.setData(msg.arg.missions);
                break;
        }
    }

    missionsTabulator = new Tabulator("#missionsTable", {
        layout: "fitColumns",
        columns: [
            { title: 'Mission ID', field: '_id' },
            { title: 'Mission Name', field: 'name', editor: 'input'},
            { title: 'Owner', field: 'username' },
            { title: 'Launch', formatter: 'link', formatterParams: { label: 'Open Mission', urlPrefix: 'cop?mission=', urlField: '_id'} }
        ]
    });
 
});