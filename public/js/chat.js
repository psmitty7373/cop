var activeChannel = '';
var activeChannelType = '';
var channels = {};
var editingMessage = false;
var userStatuses = {};

// ---------------------------- CHAT / LOG WINDOW  ----------------------------------
function notification(msg) {
    notifSound.play();
    if (!hasFocus) {
        $('#favicon').attr('href', 'images/favicon_not.ico');
    }
    /*if (!("Notification" in window) || Notification.permission === 'denied') {
        toastr.info(msg.text, msg.username)
    } else if (Notification.permission === 'granted') {
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
                var notification = new Notification(msg);
            }
        });
    }*/
}

function chatDoUpload(files) {
    var formData = new FormData();
    formData.append('channel_id', activeChannel);
    formData.append('type', activeChannelType);
    formData.append('mission_id', mission_id);

    $.each(files, function (i, file) {
        formData.append('file', file);
    });

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
                    .css("display", "block")
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
                $('#chatDropZone').fadeOut(500, function() {
                    $('#chatDropZone').css('visibility', 'hidden');
                    $('#chatDropZone').css('display', 'flex');
                    $('#chatProgressbar').css('display', 'none');
                });
            }, 500);
        },
        error: function () {
            $("#chatProgressbar").progressbar('value', 100).children('.ui-progressbar-value').html('Upload error!');
            setTimeout(function () {
                $('#chatDropZone').fadeOut(500, function() {
                    $('#chatDropZone').css('visibility', 'hidden');
                    $('#chatDropZone').css('display', 'flex');
                    $('#chatProgressbar').css('display', 'none');
                });
            }, 1500);
        }
    });
}

var chatPasteFiles = function (e) {
    if (e.originalEvent.type === 'paste') {
        var items = (event.clipboardData || event.originalEvent.clipboardData).items;
        var files = [];
        for (index in items) {
            var item = items[index];
            if (item.kind === 'file') {
                files.push(item.getAsFile())                
            }
        }

        if (files.length > 0) {
            $('#chatDropZone').css('visibility', 'visible');
            e.originalEvent.stopPropagation();
            e.originalEvent.preventDefault();
            chatDoUpload(files);
        }
    }
}

var chatDragAndDrop = function (e) {
    e.originalEvent.stopPropagation();
    e.originalEvent.preventDefault();
    var srcElement = e.originalEvent.srcElement ? e.originalEvent.srcElement : e.originalEvent.target;

    if (e.originalEvent.type === 'dragleave') {
    }

    if ($.inArray('Files', e.originalEvent.dataTransfer.types) > -1) {
        if (e.originalEvent.type == 'drop') {
            e.originalEvent.stopPropagation();
            e.originalEvent.preventDefault();
            chatDoUpload(e.originalEvent.dataTransfer.files)
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
            switch (statuses[i].status) {
                case 'online':
                    elem.css('color', '#39e500');
                    break;
                case 'idle':
                    elem.css('color', 'yellow');
                    break;
                default:
                    elem.css('color', 'red');
                    break;
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
        elem.fadeOut(25, function() { $(this).remove() });
    }
}

function chatFinishMessage(_id) {
    if (!editingMessage)
        return;

    var elem = $('#message' + _id);
    if (elem) {
        var content = elem.find('.messageContent');
        var options = elem.find('.messageOptions');
        options.show();

        var header = content.find('.messageContent-header');
        if (header) {
            header.show();
        }

        var text = content.find('.messageInput').html().replace(/<br>/gi,'\n');
        var oldMessageSpan = content.find('.oldMessage');
        var oldMessage = oldMessageSpan.text();
        oldMessageSpan.remove();

        var editor = content.find('.messageEdit');
        editor.remove();

        var preText = text;
        if (text.length > 6 && text.substr(0,3) === '```' && text.slice(-3) === '```') {
            preText = '<pre>' + text.slice(3,-3) + '</pre>';
        }

        content.append('<span class="messageBody">' + preText + '</span>');
        if (text != oldMessage) {
            if (text == "") {
                chatSendDeleteMessage(_id)
            } else {
                sendUpdateChatMessage(text, _id);
            }
        }

        editingMessage = false;
    }
}

function chatEditMessage(_id) {
    if (editingMessage)
        return;

    var elem = $('#message' + _id);
    if (elem) {
        editingMessage = true;

        var content = elem.find('.messageContent');
        var options = elem.find('.messageOptions');
        options.hide();

        var body = content.find('.messageBody');
        var oldMessage = body.html().replace('<pre>','```').replace('</pre>','```');
        body.remove();

        var header = content.find('.messageContent-header');
        if (header) {
            header.hide();
        }

        content.append('<span class="oldMessage" style="display: none">' + oldMessage + '</span><div class="messageEdit"><div class="messageInput" style="margin-bottom: 5px;" contenteditable>' + oldMessage + '</div><div class="form-group" style="margin-bottom: 0px;"><button class="btn btn-danger toolbarButton" type="button" onclick="chatFinishMessage(\'' + _id + '\');">Cancel</button><button class="btn btn-primary toolbarButton" type="button" onclick="chatFinishMessage(\'' + _id + '\');">Save Changes</button></div></div></div>');
        content.find('.messageEdit').focus().keydown(function(e) {
            var key = e.charCode || e.keyCode || 0;
            switch (key) {
                case $.ui.keyCode.ENTER:
                    if (!e.shiftKey) {
                        e.preventDefault();
                        chatFinishMessage(_id, false);
                    }
                    break;
            }
        });
        placeCaretAtEnd(content.find('.messageInput')[0]);
    }
}

//https://stackoverflow.com/questions/6249095/how-to-set-caretcursor-position-in-contenteditable-element-div
function placeCaretAtEnd(ele) {
    var range = document.createRange();
    var sel = window.getSelection();
    range.setStart(ele, 1);
    range.collapse(true);
    sel.removeAllRanges();
    sel.addRange(range);
    ele.focus();
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

function setDoScroll() {
    if(!this.animationRunning)
        this.doScroll = this.scroll().ratio.y === 1;
    else
        this.doScroll = true;
};

function performScroll(e) { 
	e.animationRunning = true;
	e.scrollStop();
	e.scroll({ y : '100%' }, 25, 'swing', function() { e.animationRunning = false; });
};

function chatAddChannels(c) {
    var style = '';
    var selected = '';
    for (var i = 0; i < c.length; i++) {
        if (c[i].name === '') {
            continue;
        }

        channels[c[i]._id] = {};
        channels[c[i]._id].earliestMessage = 2147483647000
        channels[c[i]._id].myLastMessage = null;

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
        if (!permissions.delete_access || c[i].name === 'general' || c[i].type === 'user') {
            deleteButton = '';
        }

        // append the label
        if (c[i].type === 'channel') {
            $('#chatChannelsHeading').after('<div class="channel channelLabel' + selected + '" id="label' + c[i]._id + '" data-type="' + c[i].type + '" data-name="' + c[i].name + '"><div class="channelName"># ' + c[i].name + '</div><div id="unread' + c[i]._id + '" class="channelUnread" style="display: none;"></div>' + deleteButton + '</div>');        
        } else if (c[i].type === 'user') {
            var color = 'red';
            if (c[i].status === 'online') {
                color = '#39e500';
            } else if (c[i].status === 'idle') {
                color = 'yellow';
            }
            $('#chatUsersHeading').after('<div class="channel userLabel' + selected + '" id="label' + c[i]._id + '" data-type="' + c[i].type + '" data-name="' + c[i].name + '"><div class="channelName"><span class="chatStatusIndicator fa fa-circle" style="color: ' + color + '"></span>' + c[i].name + '</div><div id="unread' + c[i]._id + '" class="channelUnread" style="display: none;"></div></div>');
        }

        // append the pane
        $('#channelPanes').append('<div class="channel-pane" id="pane' + c[i]._id + '" style="' + style +'"><div id="messages' + c[i]._id + '"></div></div>');
        $('#label' + c[i]._id).click(chatChangeChannel);
        if(deleteButton !== '') {
            $('#' + c[i]._id + 'Delete').click(chatDeleteChannel);
        }
        $('#pane' + c[i]._id).overlayScrollbars({
            className: "os-theme-light",
            sizeAutoCapable: false,
            overflowBehavior: {
                x: "scroll",
                y: "scroll"
            },
            callbacks: {
                onHostSizeChanged : function() { 
                    if(this.doScroll)
                        performScroll(this);
                },
                onContentSizeChanged : function() { 
                    if(this.doScroll)
                        performScroll(this);
                },
                onScroll : setDoScroll,
                onInitialized : setDoScroll,
                onOverflowChanged : function(e) {	
                    if(e.y) 
                        performScroll(this);
                }
            }
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

function chatUpdateMessage(message) {
    var elem = $('#message' + message._id);
    if (elem) {
        var content = elem.find('.messageContent');
        var body = content.find('.messageBody');
        // pre-formatting
        if (message.text.length > 6 && message.text.substr(0,3) === '```' && message.text.slice(-3) === '```') {
            message.text = '<pre>' + message.text.slice(3,-3) + '</pre>';
        }
        body.delay(25).fadeOut().queue(function(n) { $(this).html(message.text); n(); }).fadeIn(25);
    }
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
                bulkMsg[channel_id].lastEpoch = 0;
                bulkMsg[channel_id].messages = '';
            }
        }

        // pre-formatting
        if (messages[i].text.length > 6 && messages[i].text.substr(0,3) === '```' && messages[i].text.slice(-3) === '```') {
            messages[i].text = '<pre>' + messages[i].text.slice(3,-3) + '</pre>';
        }

        var avatar = '';
        var header = '';

        if ((bulk && (bulkMsg[channel_id].lastSender !== tuser_id || (ts - bulkMsg[channel_id].lastEpoch) > (1000 * 60 * 5))) || (!bulk && channels[channel_id].lastSender !== tuser_id)) {
            avatar = '<img class="messageAvatar" src="images/avatars/' + tuser_id + '.png"/>';
            header = '<div class="messageContent-header"><span class="messageSender">' + username + '</span><span class="messageTime">' + epochToDateString(ts) + '</span></div>';
        }

        var buttonDisabled = 'disabled';
        if (messages[i].editable) {
            buttonDisabled = '';
        }

        var messageOptions = '';
        if (tuser_id === user_id) {
            messageOptions = '<div class="messageOptions"><div class="btn-group" role="group"><button ' + buttonDisabled + ' type="button" class="btn btn-primary messageOptionBtn" onclick="chatEditMessage(\'' + messages[i]._id + '\')"><i class="fa fa-pencil"></i></button><button type="button" class="btn btn-primary messageOptionBtn" onclick="chatSendDeleteMessage(\'' + messages[i]._id + '\')"><i class="fa fa-cancel-circled"></i></button></div></div>';
        }

        var newMsg = '<div class="messageWrapper" id="message' + messages[i]._id + '"><div class="message"><div class="messageGutter">' + avatar + '</div><div class="messageContent">' + header + '<span class="messageBody">' + messages[i].text + '</span></div>' + messageOptions + '</div></div>';


        if (bulk) {
            bulkMsg[channel_id].messages += newMsg;
            bulkMsg[channel_id].lastSender = tuser_id;
            bulkMsg[channel_id].lastEpoch = ts;
        }
        else {
            newMsg = $(newMsg);

            if (!bulk && activeChannel === channel_id) {
                newMsg.hide();
            }

            newMsg.appendTo(pane);

            // if message is an alert, show a notification
            if (!bulk && user_id != tuser_id) {
                notification(messages[i]);
                /*if (messages[i].text.search('@' + username) >= 0 || messages[i].text.search('@alert') >= 0) {
                }*/
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
                newMsg.fadeIn(25);
            }

            // set last sender
            channels[channel_id].lastSender = tuser_id;
            channels[channel_id].lastEpoch = ts;
        }

        // add get-more-messages link if necessary
        if (messages[i].more && bulk) {
            bulkMsg[messages[i].channel_id].messages = '<div id="get-more-messages"><span onClick="getMoreMessages(\'' + channel_id + '\')">Get older messages.</span></div>' + bulkMsg[messages[i].channel_id].messages;
        }

        // store my last message for up-arrow editing
        if (tuser_id === user_id) {
            if (!channels[channel_id].myLastMessage) {
                channels[channel_id].myLastMessage = {};
                channels[channel_id].myLastMessage.ts = ts;
                channels[channel_id].myLastMessage._id = messages[i]._id;
            } else if (ts > channels[channel_id].myLastMessage.ts) {
                channels[channel_id].myLastMessage.ts = ts;
                channels[channel_id].myLastMessage._id = messages[i]._id;
            }
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
        }, 20);
    }

    $('#label' + channel).addClass('channelSelected');
    activeChannel = channel;
    activeChannelType = type;
}

// send chat message to db
function sendChatMessage(msg, channel, type) {
    socket.send(JSON.stringify({
        act: 'insert_chat',
        arg: {
            channel_id: channel,
            text: msg,
            type: type
        },
        msgId: msgHandler()
    }));
}

function sendUpdateChatMessage(msg, _id) {
    socket.send(JSON.stringify({
        act: 'update_chat',
        arg: {
            _id: _id,
            text: msg,
        },
        msgId: msgHandler()
    }));
}

$(window).on('load', function () {
    if (permissions.write_access) {
        $('#messageInput').prop('disabled', false);
    }

    var dragCounter = 0;
    // chat notification sound
    notifSound = new Audio('sounds/notif.mp3');

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
        },

        drop: function() {
            dragCounter = 0;
        }
    });

    $('#chat').on('dragover', chatDragAndDrop);
    $('#chat').on('dragleave', chatDragAndDrop);
    $('#chat').on('drop', chatDragAndDrop);
    $('#chat').on('paste', chatPasteFiles);

    $('#chatNewChannel').click(chatNewChannel);

    // capture enter key in chat input bar
    $("#messageInput").keydown(function(e) {
        var key = e.charCode || e.keyCode || 0;
        switch (key) {
            case $.ui.keyCode.ENTER:
                if (!e.shiftKey) {
                    e.preventDefault();
                    if ($("#messageInput").html() != '') {
                        sendChatMessage($("#messageInput").html().replace(/<br>/gi,'\n'), activeChannel, activeChannelType);
                        $("#messageInput").html('');
                    }
                }
                break;
            case $.ui.keyCode.UP:
                if (channels[activeChannel].myLastMessage) {
                    e.preventDefault();
                    chatEditMessage(channels[activeChannel].myLastMessage._id);
                }
                break;
        }
    });

    $('#chatChannels').overlayScrollbars({
        className: "os-theme-light",
    });

});