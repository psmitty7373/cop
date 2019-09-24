var activeChannel = 'log';
var chatPosition = {};
var firstChat = true;
var unreadMessages = {};

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

function addChatMessage(messages, bulk, scroll) {
    if (!bulk) {
        bulk = false;
    }
    if (!scroll) {
        scroll = false;
    }

    for (var i = 0; i < messages.length; i++) {
        var channel = messages[i].channel;
        var tuser_id = messages[i].user_id;
        var username = messages[i].username;

        if (!earliest_messages[channel]) {
            earliest_messages[channel] = 2147483647000
        }

        var pane = $('#' + channel + 'Messages');
        var ts = messages[i].timestamp;

        if (ts < earliest_messages[channel]) {
            earliest_messages[channel] = ts;
        }

        if (messages[i].prepend) {
            pane.prepend('<div class="messageWrapper"><div class="message"><div class="messageGutter"><img class="messageAvatar" src="images/avatars/' + tuser_id + '.png"/></div><div class="messageContent"><div class="messageContent-header"><span class="messageSender">' + username + '</span><span class="messageTime">' + epochToDateString(ts) + '</span></div><span class="messageBody">' + messages[i].text + '</span></div></div>');
        }
        else {
            // check if at bottom
            var atBottom = ($('#' + channel).overlayScrollbars().scroll().max.y == $('#' + channel).overlayScrollbars().scroll().position.y);

            var newMsg = $('<div class="messageWrapper"><div class="message"><div class="messageGutter"><img class="messageAvatar" src="images/avatars/' + tuser_id + '.png"/></div><div class="messageContent"><div class="messageContent-header"><span class="messageSender">' + username + '</span><span class="messageTime">' + epochToDateString(ts) + '</span></div><span class="messageBody">' + messages[i].text + '</span></div></div>');

            if (!bulk && activeChannel === channel) {
                newMsg.hide();
            }

            newMsg.appendTo(pane);

            if (!bulk && channel !== 'log' && user_id != tuser_id) {
                if (messages[i].text.search('@' + username) >= 0 || messages[i].text.search('@alert') >= 0) {
                    notification(messages[i]);
                }
            }

            if (!bulk && channel !== 'log' && (activeTable !== 'chat' || activeChannel !== channel)) {
                if (!unreadMessages[channel]) {
                    $('.newMessage').removeClass('newMessage');
                    $('.newMessageLabel').remove();
                    unreadMessages[channel] = 1;
                    newMsg.addClass('newMessage');
                    newMsg.append('<div class="newMessageLabel">New Messages</div>');
                } else
                    unreadMessages[channel]++;
                $('#unread-' + channel).text(unreadMessages[channel]).show();
                $('#chatTab').css('background-color', '#ff6060');
            }

            if (!bulk && activeChannel === channel) {
                newMsg.fadeIn('fast');
            }

            // if at bottom, wait for 
            if (atBottom) {
                setTimeout(function () {
                    $('#' + channel).overlayScrollbars().scroll($('#' + channel).overlayScrollbars().scroll().max.y);
                }, 50);
            }
        }
        if (messages[i].more)
            pane.prepend('<div id="get-more-messages"><span onClick="getMoreMessages(\'' + channel + '\')">Get older messages.</span></div>');
    }

    // scroll to bottom
    if (scroll) {
        setTimeout(function() {
            $('#log').overlayScrollbars().scroll($('#log').overlayScrollbars().scroll().max.y);
        }, 100);
    }
}

// called when a user requests more history from teh current chat
function getMoreMessages(channel) {
    $('#get-more-messages').remove();
    socket.send(JSON.stringify({
        act: 'get_old_chats',
        arg: {
            channel: channel,
            start_from: earliest_messages[channel]
        },
        msgId: msgHandler()
    }));
}


function newChannel() {
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

$(document).ready(function () {
    // chat notification sound
    notifSound = new Audio('sounds/knock.mp3');

    $('.channel').click(function (e) {
        var channel = e.target.id.split('-')[1];

        if (channel !== activeChannel) {
            if ($('#' + activeChannel).overlayScrollbars().scroll().max.y == $('#' + activeChannel).overlayScrollbars().scroll().position.y) {
                chatPosition[activeChannel] = 'bottom';
            } else {
                chatPosition[activeChannel] = $('#' + channel).overlayScrollbars().scroll().position.y;
            }
        }

        $('.channel-pane').hide();
        $('.channel').removeClass('channelSelected');
        $('#' + channel).show();
        unreadMessages[channel] = 0;
        $('#unread-' + channel).hide();
        $('#chatTab').css('background-color', '');

        if (!chatPosition[channel] || chatPosition[channel] === 'bottom') {
            setTimeout(function() {
                $('#' + channel).overlayScrollbars().scroll($('#' + channel).overlayScrollbars().scroll().max.y);
            }, 50);
        }

        $('#channel-' + channel).addClass('channelSelected');
        activeChannel = channel;
    });

    // clear unread when clicking on channel
    $('#chatTab').click(function (e) {
        unreadMessages[activeChannel] = 0;
        $('#unread-' + activeChannel).hide();
        $('#chatTab').css('background-color', '');
    });

    $('#newChannel').click(newChannel);

    // capture enter key in chat input bar
    $("#messageInput").keypress(function (e) {
        var key = e.charCode || e.keyCode || 0;
        if (key === $.ui.keyCode.ENTER) {
            sendChatMessage($("#messageInput").val(), activeChannel);
            $("#messageInput").val('');
        }
    });
});