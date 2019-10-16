var activeChannel = '';
var activeChannelType = '';
var firstChat = true;
var channels = {};

// toastr
var notifSound = null;
toastr.options = {
    "closeButton": true,
    "debug": false,
    "newestOnTop": false,
    "progressBar": false,
    "positionClass": "toast-top-center",
    "preventDuplicates": true,
    "onclick": null,
    "showDuration": "300",
    "hideDuration": "1000",
    "timeOut": "5000",
    "extendedTimeOut": "1000",
    "showEasing": "swing",
    "hideEasing": "linear",
    "showMethod": "fadeIn",
    "hideMethod": "fadeOut"
}

// ---------------------------- CHAT / LOG WINDOW  ----------------------------------
function notification(msg) {
    if (!("Notification" in window) || Notification.permission === 'denied') {
        notifSound.play();
        toastr.info(msg.text, msg.username)
    } else if (Notification.permission === 'granted') {
        notifSound.play();
        var notification = new Notification(msg.username, {
            icon: 'images/avatars/' + msg.tuser_id + '.png',
            body: msg.text
        });
    } else {
        Notification.requestPermission(function (permission) {
            if (!('permission' in Notification)) {
                Notification.permission = permission;
            }
            if (permission === 'granted') {
                notifSound.play();
                var notification = new Notification(msg);
            }
        });
    }
}

var chatDragAndDrop = function (e) {

    e.originalEvent.stopPropagation();
    e.originalEvent.preventDefault();

    var srcElement = e.originalEvent.srcElement ? e.originalEvent.srcElement : e.originalEvent.target;

    if (e.originalEvent.type === 'dragleave') {
    }

    if ($.inArray('Files', e.originalEvent.dataTransfer.types) > -1) {
        e.originalEvent.stopPropagation();
        e.originalEvent.preventDefault();
        e.originalEvent.dataTransfer.dropEffect = ($(srcElement).hasClass('droppable')) ? 'copy' : 'none';

        if (e.originalEvent.dataTransfer.dropEffect === 'copy' && e.originalEvent.type !== 'dragleave') {
            
        }

        e.originalEvent.dataTransfer.types

        if (e.originalEvent.type == 'drop') {
            var formData = new FormData();
            formData.append('channel_id', activeChannel);
            formData.append('type', activeChannelType);

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
                        
                        $("#chatProgressbar")
                            .progressbar({
                                value: 0
                            })
                            .children('.ui-progressbar-value')
                            .html('0%')
                            .css("display", "block");
                        mxhr.upload.addEventListener('progress', chatProgressHandler, false);
                        
                    }
                    return mxhr;
                },
                data: formData,
                dataType: 'json',
                cache: false,
                contentType: false,
                processData: false,
                success: function () {
                    $("#chatProgressbar").progressbar('value', 100).children('.ui-progressbar-value').html('Upload successful!');
                    setTimeout(function () {
                        $("#chatProgressbar").fadeOut("slow");
                        $('#chatDropZone').css('visibility', 'hidden');
                    }, 2000);
                },
                error: function () {
                    $("#chatProgressbar").progressbar('value', 100).children('.ui-progressbar-value').html('Upload error!');
                    $('#chatDropZone').css('visibility', 'hidden');
                    console.log('upload error');
                }
            });
            
            $('#chat').removeClass('dragging');
        }
    }
};

function chatProgressHandler(e) {
    if (e.lengthComputable) {
        var p = Math.floor((e.loaded / e.total) * 100);
        $("#chatProgressbar").progressbar('value', p).children('.ui-progressbar-value').html(p.toPrecision(3) + '%');

    }
}

function deleteChannel(e) {
    console.log(e);
}

function addChatChannels(c) {
    var style = '';
    var selected = '';
    for (var i = 0; i < c.length; i++) {
        if (c[i].name === '') {
            continue;
        }

        channels[c[i]._id] = {};
        channels[c[i]._id].earliestMessage = 2147483647000

        if (c[i].name === 'general') {
            activeChannel = c[i]._id;
            activeChannelType = 'channel';
            style = '';
            selected = ' channelSelected';
        } else {
            style = 'display: none;';
            selected = '';
        }

        var deleteButton = '<div id="' + c[i]._id + 'Delete" class="fa fa-cancel-circled channelDeleteIcon"></div>';
        if (!permissions.delete_access || c[i].name === 'log' || c[i].name === 'general') {
            deleteButton = '';
        }

        if (c[i].type === 'channel') {
            $('#channelsHeading').after('<div class="channel channelLabel' + selected + '" id="' + c[i]._id + 'Label" data-type="' + c[i].type + '" data-name="' + c[i].name + '"><div class="channelName"># ' + c[i].name + '</div><div id="' + c[i]._id + 'Unread" class="channelUnread" style="display: none;"></div>' + deleteButton + '</div>');        
        } else if (c[i].type === 'user') {
            $('#usersHeading').after('<div class="channel userLabel' + selected + '" id="' + c[i]._id + 'Label" data-type="' + c[i].type + '" data-name="' + c[i].name + '"><div class="channelName">O ' + c[i].name + '</div><div id="' + c[i]._id + 'Unread" class="channelUnread" style="display: none;"></div>' + deleteButton + '</div>');
        }

        $('#channelPanes').append('<div class="channel-pane" id="' + c[i]._id + 'Pane" style="' + style +'"><div id="' + c[i]._id + 'Messages"></div></div>');
        $('#' + c[i]._id + 'Label').click(changeChannel);
        $('#' + c[i]._id + 'Delete').click(deleteChannel);
        $('#' + c[i]._id + 'Pane').overlayScrollbars({
            className: "os-theme-light"
        });
    }
    $('#channelsHeading').after($('div.channelLabel').sort(function (a, b) {
        var contentA = $(a).attr('data-name');
        var contentB = $(b).attr('data-name');
        return (contentA < contentB) ? -1 : (contentA > contentB) ? 1 : 0;
     }));

     $('#usersHeading').after($('div.userLabel').sort(function (a, b) {
        var contentA = $(a).attr('data-name');
        var contentB = $(b).attr('data-name');
        return (contentA < contentB) ? -1 : (contentA > contentB) ? 1 : 0;
     }));
}

// adds chat messages to chat panels
function addChatMessage(messages, bulk, scroll) {
    if (!bulk) {
        bulk = false;
    }
    if (!scroll) {
        scroll = false;
    }

    var bulkMsg = {};

    for (var i = 0; i < messages.length; i++) {
        if (messages[i].text === '') {
            continue;
        }

        var channel_id = messages[i].channel_id;
        var tuser_id = messages[i].user_id;
        var username = messages[i].username;

        var pane = $('#' + channel_id + 'Messages');
        var ts = messages[i].timestamp;

        if (ts < channels[channel_id].earliestMessage) {
            channels[channel_id].earliestMessage = ts;
        }

        if (bulk) {
            if (!bulkMsg[channel_id]) {
                bulkMsg[channel_id] = {};
                bulkMsg[channel_id].lastSender = '';
                bulkMsg[channel_id].messages = '';
            }
        }

        // pre-formatting
        if (messages[i].text.length > 6 && messages[i].text.substr(0,3) === '```' && messages[i].text.slice(-3) === '```') {
            messages[i].text = '<pre>' + messages[i].text.slice(3,-3) + '</pre>';
        }

        var avatar = '';
        var header = '';
        if ((bulk && bulkMsg[channel_id].lastSender !== tuser_id) || (!bulk && channels[channel_id].lastSender !== tuser_id)) {
            avatar = '<img class="messageAvatar" src="images/avatars/' + tuser_id + '.png"/>';
            header = '<div class="messageContent-header"><span class="messageSender">' + username + '</span><span class="messageTime">' + epochToDateString(ts) + '</span></div>';
        }
        
        var newMsg = '<div class="messageWrapper"><div class="message"><div class="messageGutter">' + avatar + '</div><div class="messageContent">' + header + '<span class="messageBody">' + messages[i].text + '</span></div><div class="messageOptions"><div class="btn-group" role="group"><button type="button" class="btn btn-primary messageOptionBtn"><i class="fa fa-pencil"></i></button><button type="button" class="btn btn-primary messageOptionBtn"><i class="fa fa-cancel-circled"></i></button></div></div></div></div>';

        if (bulk) {
            bulkMsg[channel_id].messages += newMsg;
            bulkMsg[channel_id].lastSender = tuser_id;
        }
        else {
            newMsg = $(newMsg);

            // check if at bottom
            var atBottom = ($('#' + channel_id + 'Pane').overlayScrollbars().scroll().max.y == $('#' + channel_id + 'Pane').overlayScrollbars().scroll().position.y);
            
            if (!bulk && activeChannel === channel_id) {
                newMsg.hide();
            }

            newMsg.appendTo(pane);

            // if message is an alert, show a notification
            if (!bulk && user_id != tuser_id) {
                if (messages[i].text.search('@' + username) >= 0 || messages[i].text.search('@alert') >= 0) {
                    notification(messages[i]);
                }
            }

            // not the active channel
            if (!bulk && activeChannel !== channel_id) {
                if (!channels[channel_id].unreadMessages) {
                    $('.newMessage').removeClass('newMessage');
                    $('.newMessageLabel').remove();
                    channels[channel_id].unreadMessages = 1;
                    newMsg.addClass('newMessage');
                    newMsg.append('<div class="newMessageLabel">New Messages</div>');
                } else
                    channels[channel_id].unreadMessages++;
                $('#' + channel_id + 'Unread').text(channels[channel_id].unreadMessages).show();
                $('#chatTab').css('background-color', '#ff6060');
            }

            // channel is currently active, so fade in the message
            if (!bulk && activeChannel === channel_id) {
                newMsg.fadeIn('fast');
            }

            // set last sender
            channels[channel_id].lastSender = tuser_id;

            // if at bottom, wait for 
            if (atBottom) {
                setTimeout(function () {
                    $('#' + channel_id + 'Pane').overlayScrollbars().scroll($('#' + channel_id + 'Pane').overlayScrollbars().scroll().max.y);
                }, 100);
            }
        }
        if (messages[i].more && bulk) {
            bulkMsg[messages[i].channel_id].messages = '<div id="get-more-messages"><span onClick="getMoreMessages(\'' + channel_id + '\')">Get older messages.</span></div>' + bulkMsg[messages[i].channel_id].messages;
        }
    }

    if (bulk) {
        for (var key in bulkMsg) {
            if (bulkMsg.hasOwnProperty(key)) {
                var pane = $('#' + key + 'Messages');
                $(bulkMsg[key].messages).prependTo(pane);
            }
        }
    }

    // scroll to bottom
    if (scroll) {
        setTimeout(function() {
            $('#' + activeChannel + 'Pane').overlayScrollbars().scroll($('#' + activeChannel + 'Pane').overlayScrollbars().scroll().max.y);
        }, 200);
    }
}

// called when a user requests more history from the current chat
function getMoreMessages(channel_id) {
    $('#get-more-messages').remove();
    socket.send(JSON.stringify({
        act: 'get_old_chats',
        arg: {
            channel_id: channel_id,
            start_from: channels[channel_id].earliestMessage
        },
        msgId: msgHandler()
    }));
}


function newChannel() {
    var msg = `
<form>
    <div class="form-group row">
        <label for="ncName" class="col-sm-4 col-form-label">Channel Name:</label>
        <div class="col-sm-8">
            <input type="text" class="form-control" id="ncName">
        </div>
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
                    var name = $('#ncName').val();
                    socket.send(JSON.stringify({
                        act: 'insert_chat_channel',
                        arg: {
                            name: name
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

function changeChannel(e) {
    if (e.target.id.indexOf('Label') === -1) {
        return;
    }

    var channel = e.target.id.split('Label')[0];
    var type = $(e.target).attr('data-type');

    if (channel !== activeChannel && activeChannel !== '') {
        if ($('#' + activeChannel + 'Pane').overlayScrollbars().scroll().max.y == $('#' + activeChannel + 'Pane').overlayScrollbars().scroll().position.y) {
            channels[activeChannel].position = 'bottom';
        } else {
            channels[activeChannel].position = $('#' + activeChannel + 'Pane').overlayScrollbars().scroll().position.y;
        }
    }

    $('.channel-pane').hide();
    $('.channel').removeClass('channelSelected');
    $('#' + channel + 'Pane').show();
    channels[channel].unreadMessages = 0;
    $('#' + channel + 'Unread').hide();
    $('#chatTab').css('background-color', '');

    if (channels[channel].position === undefined || channels[channel].position === 'bottom') {
        setTimeout(function() {
            $('#' + channel + 'Pane').overlayScrollbars().scroll($('#' + channel + 'Pane').overlayScrollbars().scroll().max.y);
        }, 50);
    }

    $('#' + channel + 'Label').addClass('channelSelected');
    activeChannel = channel;
    activeChannelType = type;
}

$(window).on('load', function () {
    var dragCounter = 0;
    // chat notification sound
    notifSound = new Audio('sounds/knock.mp3');

    // clear unread when clicking on channel
    $('#chatTab').click(function (e) {
        channels[activeChannel].unreadMessages = 0;
        $('#' + activeChannel + 'Unread').hide();
        $('#chatTab').css('background-color', '');
    });

    $('#chat').bind({
        dragenter: function(e) {
            e.preventDefault(); // needed for IE
            e.stopPropagation();
            $('#chat').addClass('dragging');
            $('#chatDropZone').css('visibility', 'visible');
            dragCounter++;
        },
    
        dragleave: function() {
            dragCounter--;
            if (dragCounter === 0) { 
                $('#chat').removeClass('dragging');
                $('#chatDropZone').css('visibility', 'hidden');
            }
        }
    });

    $('#chat').on('dragover', chatDragAndDrop);
    $('#chat').on('dragleave', chatDragAndDrop);
    $('#chat').on('drop', chatDragAndDrop);

    $('#newChannel').click(newChannel);

    // capture enter key in chat input bar
    $("#messageInput").keypress(function (e) {
        var key = e.charCode || e.keyCode || 0;
        if (key === $.ui.keyCode.ENTER) {
            if ($("#messageInput").val() != '') {
                sendChatMessage($("#messageInput").val(), activeChannel, activeChannelType);
                $("#messageInput").val('');
            }
        }
    });
});