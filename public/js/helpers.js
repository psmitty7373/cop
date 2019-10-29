// ---------------------------- Various Helper Functions  ----------------------------------
//https://stackoverflow.com/questions/11832914/round-to-at-most-2-decimal-places-only-if-necessary
Number.prototype.round = function (places) {
    return +(Math.round(this + "e+" + places) + "e-" + places);
}

// convert hex to rgb
function rgba2rgb(hex, a) {
    hex = hex.replace('#', '');
    var bigint = parseInt(hex, 16);
    var r = (bigint >> 16) & 255;
    var g = (bigint >> 8) & 255;
    var b = bigint & 255;
    r1 = (1 - a) * 255 + a * r;
    g1 = (1 - a) * 255 + a * g;
    b1 = (1 - a) * 255 + a * b;
    var bin = r1 << 16 | g1 << 8 | b1;
    return (function (h) {
        return new Array(7 - h.length).join("0") + h
    })(bin.toString(16).toUpperCase())
}

// zero pad a number
function addZero(i) {
    if (i < 10) {
        i = "0" + i;
    }
    return i;
}

// https://ciphertrick.com/2014/12/07/download-json-data-in-csv-format-cross-browser-support/
function msieversion() {
    var ua = window.navigator.userAgent;
    var msie = ua.indexOf("MSIE ");
    if (msie > 0 || !!navigator.userAgent.match(/Trident.*rv\:11\./)) {
        return true;
    } else { // If another browser,
        return false;
    }
}

// convert JSON from jqgrids to csv for export
function JSONToCSVConvertor(JSONData, fileName) {
    var arrData = typeof JSONData != 'object' ? JSON.parse(JSONData) : JSONData;
    var CSV = '';
    var row = "";
    for (var index in arrData[0]) {
        row += index + ',';
    }
    row = row.slice(0, -1);
    CSV += row + '\r\n';
    for (var i = 0; i < arrData.length; i++) {
        var row = "";
        for (var index in arrData[i]) {
            var arrValue = arrData[i][index] == null ? "" : '"' + arrData[i][index] + '"';
            row += arrValue + ',';
        }
        row.slice(0, row.length - 1);
        CSV += row + '\r\n';
    }
    if (CSV == '') {
        return;
    }
    var fileName = "Result";
    if (msieversion()) {
        var IEwindow = window.open();
        IEwindow.document.write('sep=,\r\n' + CSV);
        IEwindow.document.close();
        IEwindow.document.execCommand('SaveAs', true, fileName + ".csv");
        IEwindow.close();
    } else {
        var uri = 'data:application/csv;charset=utf-8,' + escape(CSV);
        var link = document.createElement("a");
        link.href = uri;
        link.style = "visibility:hidden";
        link.download = fileName + ".csv";
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    }
}

function epochToDateString(value) {
    if (isNaN(value)) {
        return value;
    } else return (getDate(parseInt(value)));
}

function getDate(value) {
    var date;
    if (value !== undefined)
        date = new Date(value);
    else
        date = new Date();
    return date.getFullYear() + '-' + addZero(date.getMonth() + 1) + '-' + addZero(date.getDate()) + ' ' + addZero(date.getHours()) + ':' + addZero(date.getMinutes()) + ':' + addZero(date.getSeconds()) + '.' + date.getMilliseconds();
}

function dateStringToEpoch(value) {
    var parts = value.match(/(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2}):(\d{2})\.(\d+)/);
    var d = new Date(parts[1], parts[2] - 1, parts[3], parts[4], parts[5], parts[6], parts[7]);
    return (d.getTime());
}

function getObjCtr(o) {
    var x = (o.width * o.scaleX) / 2 + o.left;
    var y = (o.height * o.scaleY) / 2 + o.top;
    return {
        x: x,
        y: y
    };
}

var entityMap = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
    '/': '&#x2F;',
    '`': '&#x60;',
    '=': '&#x3D;'
};

function escapeHtml(string) {
    return String(string).replace(/[&<>"'`=\/]/g, function (s) {
        return entityMap[s];
    });
}

function deleteConfirm(f) {
    $('#modal-title').text('Are you sure?');
    $('#modal-body').html('<p>Are you sure you want to delete this?</p><p>Deleting things will also remove any attached notes or files.</p>');
    $('#modal-footer').html('<button type="button btn-primary" class="button btn btn-danger" data-dismiss="modal" onClick="' + f + ';">Yes</button> <button type="button" class="button btn btn-primary" data-dismiss="modal">No</button>');
    $('#modal-content').removeAttr('style');
    $('#modal-content').removeClass('modal-details');
    $('#modal').modal('show')
}

function copyText(text) {
    var t = $("<input>");
    $("body").append(t);
    t.val(text).select();
    document.execCommand("copy");
    t.remove();
}