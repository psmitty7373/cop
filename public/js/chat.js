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
    notifSound.play();
    if (!("Notification" in window) || Notification.permission === 'denied') {
        toastr.info(msg.text, msg.username)
    }
    else if (Notification.permission === 'granted') {
        var notification = new Notification(msg.username, {
            icon: 'images/avatars/' + msg.user_id + '.png',
            body: msg.text
        });
    }
    else {
        Notification.requestPermission(function (permission) {
            if (!('permission' in Notification)) {
                Notification.permission = permission;
            }
            if (permission === 'granted') {
                var notification = new Notification(msg);
            }
        });
    }
}

function addChatMessage(messages, bulk) {
    if (!bulk)
        bulk = false;
    for (var i = 0; i < messages.length; i++) {
        if (!earliest_messages[messages[i].channel])
            earliest_messages[messages[i].channel] = 2147483647000
        var pane = $('#' + messages[i].channel);
        var ts = messages[i].timestamp;
        if (ts < earliest_messages[messages[i].channel]) {
            earliest_messages[messages[i].channel] = ts;
        }
        if (messages[i].prepend)
            pane.prepend('<div class="messageWrapper"><div class="message"><div class="messageGutter"><img class="messageAvatar" src="images/avatars/' + messages[i].user_id + '.png"/></div><div class="messageContent"><div class="messageContent-header"><span class="messageSender">' + messages[i].username + '</span><span class="messageTime">' + epochToDateString(ts) + '</span></div><span class="messageBody">' + messages[i].text + '</span></div></div>');
        else {
            var atBottom = $('#' + messages[i].channel)[0].scrollHeight - Math.round($('#' + messages[i].channel).scrollTop()) == $('#' + messages[i].channel).outerHeight();
            var newMsg = $('<div class="messageWrapper"><div class="message"><div class="messageGutter"><img class="messageAvatar" src="images/avatars/' + messages[i].user_id + '.png"/></div><div class="messageContent"><div class="messageContent-header"><span class="messageSender">' + messages[i].username + '</span><span class="messageTime">' + epochToDateString(ts) + '</span></div><span class="messageBody">' + messages[i].text + '</span></div></div>');
            if (!bulk && activeChannel === messages[i].channel)
                newMsg.hide();
            newMsg.appendTo(pane);
            if (!bulk && messages[i].channel !== 'log' && user_id != messages[i].user_id) {
                if (messages[i].text.search('@' + username) >= 0 || messages[i].text.search('@alert') >= 0) {
                    notification(messages[i]);
                }
            }
            if (!bulk && messages[i].channel !== 'log' && (activeTable !== 'chat' || activeChannel !== messages[i].channel)) {
                if (!unreadMessages[messages[i].channel]) {
                    $('.newMessage').removeClass('newMessage');
                    $('.newMessageLabel').remove();
                    unreadMessages[messages[i].channel] = 1;
                    newMsg.addClass('newMessage');
                    newMsg.append('<div class="newMessageLabel">New Messages</div>');
                }
                else
                    unreadMessages[messages[i].channel]++;
                $('#unread-' + messages[i].channel).text(unreadMessages[messages[i].channel]).show();
                $('#chatTab').css('background-color', '#ff6060');
            }
            if (!bulk && activeChannel === messages[i].channel)
                newMsg.fadeIn('fast');
            if (atBottom)
                $('#' + messages[i].channel).scrollTop($('#' + messages[i].channel)[0].scrollHeight);
        }
        if (messages[i].more)
            pane.prepend('<div id="get-more-messages"><span onClick="getMoreMessages(\'' + messages[i].channel + '\')">Get older messages.</span></div>');
    }
}

// called when a user requests more history from teh current chat
function getMoreMessages(channel) {
    $('#get-more-messages').remove();
    socket.send(JSON.stringify({act:'get_old_chats', arg: {channel: channel, start_from: earliest_messages[channel]}, msgId: msgHandler()}));
}
