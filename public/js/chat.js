var activeChannel = '';
var activeChannelType = '';
var firstChat = true;
var channels = {};
var userStatuses = {};

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

function chatUpdateUserStatus(statuses) {
    userStatuses = statuses;
    for (var i = 0; i < statuses.length; i++) {
        var elem = $('#label' + statuses[i]._id).find('.chatStatusIndicator');
        if (elem) {
            if (statuses[i].status === 'online') {
                
                elem.addClass('chatStatusOnline');
            }
            else {
                elem.removeClass('chatStatusOnline');
            }
        }
    }
}

function chatDeleteChannel(e) {
    console.log(e);
}

function chatDeleteMessage(msg) {
    var elem = $('#message' + msg);
    if (elem) {
        elem.fadeOut('fast', function() { $(this).remove() });
    }
}

function chatSendDeleteMessage(_id) {
    socket.send(JSON.stringify({
        act: 'delete_chat',
        arg: {
            _id: _id
        },
        msgId: msgHandler()
    }));
}

function chatAddChannels(c) {
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
        if (!permissions.delete_access || c[i].name === 'log' || c[i].name === 'general' || c[i].type === 'user') {
            deleteButton = '';
        }

        // append the label
        if (c[i].type === 'channel') {
            $('#chatChannelsHeading').after('<div class="channel channelLabel' + selected + '" id="label' + c[i]._id + '" data-type="' + c[i].type + '" data-name="' + c[i].name + '"><div class="channelName"># ' + c[i].name + '</div><div id="unread' + c[i]._id + '" class="channelUnread" style="display: none;"></div>' + deleteButton + '</div>');        
        } else if (c[i].type === 'user') {
            var status = '';
            if (c[i].status === 'online') {
                status = 'chatStatusOnline';
            }
            $('#chatUsersHeading').after('<div class="channel userLabel' + selected + '" id="label' + c[i]._id + '" data-type="' + c[i].type + '" data-name="' + c[i].name + '"><div class="channelName"><span class="chatStatusIndicator ' + status + ' fa fa-circle"></span>' + c[i].name + '</div><div id="unread' + c[i]._id + '" class="channelUnread" style="display: none;"></div></div>');
        }

        // append the pane
        $('#channelPanes').append('<div class="channel-pane" id="pane' + c[i]._id + '" style="' + style +'"><div id="messages' + c[i]._id + '"></div></div>');
        $('#label' + c[i]._id).click(chatChangeChannel);
        if(deleteButton !== '') {
            $('#' + c[i]._id + 'Delete').click(deleteChannel);
        }
        $('#pane' + c[i]._id).overlayScrollbars({
            className: "os-theme-light"
        });
    }

    // sort the users / channels
    $('#chatChannelsHeading').after($('div.channelLabel').sort(function (a, b) {
        var contentA = $(a).attr('data-name');
        var contentB = $(b).attr('data-name');
        return (contentA < contentB) ? -1 : (contentA > contentB) ? 1 : 0;
     }));

     $('#chatUsersHeading').after($('div.userLabel').sort(function (a, b) {
        var contentA = $(a).attr('data-name');
        var contentB = $(b).attr('data-name');
        return (contentA < contentB) ? -1 : (contentA > contentB) ? 1 : 0;
     }));
}

// adds chat messages to chat panels
function chatAddMessage(messages, bulk, scroll) {
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

        var pane = $('#messages' + channel_id);
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

        var messageOptions = '';
        if (tuser_id === user_id) {
            messageOptions = '<div class="messageOptions"><div class="btn-group" role="group"><button type="button" class="btn btn-primary messageOptionBtn"><i class="fa fa-pencil"></i></button><button type="button" class="btn btn-primary messageOptionBtn" onclick="chatSendDeleteMessage(\'' + messages[i]._id + '\')"><i class="fa fa-cancel-circled"></i></button></div></div>';
        }

        var newMsg = '<div class="messageWrapper" id="message' + messages[i]._id + '"><div class="message"><div class="messageGutter">' + avatar + '</div><div class="messageContent">' + header + '<span class="messageBody">' + messages[i].text + '</span></div>' + messageOptions + '</div></div>';

        if (bulk) {
            bulkMsg[channel_id].messages += newMsg;
            bulkMsg[channel_id].lastSender = tuser_id;
        }
        else {
            newMsg = $(newMsg);

            // check if at bottom
            var atBottom = ($('#pane' + channel_id).overlayScrollbars().scroll().max.y == $('#pane' + channel_id).overlayScrollbars().scroll().position.y);
            
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
                $('#unread' + channel_id).text(channels[channel_id].unreadMessages).show();
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
                    $('#pane' + channel_id).overlayScrollbars().scroll($('#pane' + channel_id).overlayScrollbars().scroll().max.y);
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
                var pane = $('#messages' + key);
                $(bulkMsg[key].messages).prependTo(pane);
            }
        }
    }

    // scroll to bottom
    if (scroll) {
        setTimeout(function() {
            $('#pane' + activeChannel).overlayScrollbars().scroll($('#pane' + activeChannel).overlayScrollbars().scroll().max.y);
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


function chatNewChannel() {
    bootbox.prompt('Channel name?', function (name) {
        socket.send(JSON.stringify({
            act: 'insert_chat_channel',
            arg: {
                name: name
            },
            msgId: msgHandler()
        }));
    });
}

function chatChangeChannel(e) {
    if (e.target.id.indexOf('label') === -1) {
        return;
    }

    var channel = e.target.id.split('label')[1];
    var type = $(e.target).attr('data-type');

    if (channel !== activeChannel && activeChannel !== '') {
        if ($('#pane' + activeChannel).overlayScrollbars().scroll().max.y == $('#pane' + activeChannel).overlayScrollbars().scroll().position.y) {
            channels[activeChannel].position = 'bottom';
        } else {
            channels[activeChannel].position = $('#pane' + activeChannel).overlayScrollbars().scroll().position.y;
        }
    }

    $('.channel-pane').hide();
    $('.channel').removeClass('channelSelected');
    $('#pane' + channel).show();
    channels[channel].unreadMessages = 0;
    $('#unread' + channel).hide();
    $('#chatTab').css('background-color', '');

    if (channels[channel].position === undefined || channels[channel].position === 'bottom') {
        setTimeout(function() {
            $('#pane' + channel).overlayScrollbars().scroll($('#pane' + channel).overlayScrollbars().scroll().max.y);
        }, 50);
    }

    $('#label' + channel).addClass('channelSelected');
    activeChannel = channel;
    activeChannelType = type;
}

$(window).on('load', function () {
    if (permissions.write_access) {
        $('#messageInput').prop('disabled', false);
    }

    var dragCounter = 0;
    // chat notification sound
    notifSound = new Audio('sounds/knock.mp3');

    // clear unread when clicking on channel
    $('#chatTab').click(function (e) {
        channels[activeChannel].unreadMessages = 0;
        $('#unread' + activeChannel).hide();
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

    $('#chatNewChannel').click(chatNewChannel);

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