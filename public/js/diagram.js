// ---------------------------- FABRIC CANVASES ----------------------------------
MAXWIDTH = 2000;
MAXHEIGHT = 2000;
//fabric.Object.prototype.originX = 'left';
//fabric.Object.prototype.originY = 'top';
fabric.Group.prototype.hasControls = false;
fabric.Object.prototype.transparentCorners = false;
fabric.Object.prototype.cornerSize = 7;
fabric.Object.prototype.objectCaching = true;
fabric.Object.prototype.noScaleCache = false;
fabric.Object.NUM_FRACTION_DIGITS = 10;
fabric.Object.prototype.lockScalingFlip = true;
fabric.Group.prototype.hasControls = false;
fabric.Group.prototype.lockScalingX = true;
fabric.Group.prototype.lockScalingY = true;

// canvas initilization
var canvas = new fabric.Canvas('canvas', {
    preserveObjectStacking: true,
    renderOnAddRemove: false,
    enableRetinaScaling: false,
    uniScaleTransform: true,
    width: MAXWIDTH,
    height: MAXHEIGHT
});

// actions when double clicking on the canvas
fabric.util.addListener(canvas.upperCanvasEl, 'dblclick', function (e) {
    var o = canvas.findTarget(e);
    if (canvas.getActiveObjects().length === 1 && !creatingLink) {
        if (o.objType !== undefined) {
            $('#propID').val(o._id);
            $('#propFillColor').val(o.fill);
            $('#propFillColor').data('paletteColorPickerPlugin').reload();
            $('#lockObject').prop('checked', o.locked);
            $('#propStrokeColor').val(o.stroke);
            $('#propStrokeColor').data('paletteColorPickerPlugin').reload();
            $('#propName').val('');
            if (o.children !== undefined) {
                for (var i = 0; i < o.children.length; i++) {
                    if (o.children[i].objType === 'name')
                        $('#propName').val(o.children[i].text);
                }
            }
            $('#propType').val(o.objType);
            $('#prop-' + o.objType).val(o.image.replace('.svg', '.png'));
            $('#prop-' + o.objType).data('picker').sync_picker_with_select();
            openToolbar('tools');
        }
    } else {
        updateSelection();
    }
});

// Rescale stroke widths based on object size
// http://jsfiddle.net/davidtorroija/nawLjtn8/
fabric.Object.prototype.resizeToScale = function () {
    switch (this.type) {
        case "circle":
            this.radius *= this.scaleX;
            this.scaleX = 1;
            this.scaleY = 1;
            break;
        case "ellipse":
            this.rx *= this.scaleX;
            this.ry *= this.scaleY;
            this.width = this.rx * 2;
            this.height = this.ry * 2;
            this.scaleX = 1;
            this.scaleY = 1;
            break;
        case "polygon":
        case "polyline":
            var points = this.get('points');
            for (var i = 0; i < points.length; i++) {
                var p = points[i];
                p.x *= this.scaleX
                p.y *= this.scaleY;
            }
            this.scaleX = 1;
            this.scaleY = 1;
            this.width = this.getBoundingBox().width;
            this.height = this.getBoundingBox().height;
            break;
        case "triangle":
        case "line":
        case "rect":
            this.width *= this.scaleX;
            this.height *= this.scaleY;
            this.scaleX = 1;
            this.scaleY = 1;
        default:
            break;
    }
}

fabric.Object.prototype.getBoundingBox = function () {
    var minX = null;
    var minY = null;
    var maxX = null;
    var maxY = null;
    switch (this.type) {
        case "polygon":
        case "polyline":
            var points = this.get('points');

            for (var i = 0; i < points.length; i++) {
                if (typeof (minX) == undefined) {
                    minX = points[i].x;
                } else if (points[i].x < minX) {
                    minX = points[i].x;
                }
                if (typeof (minY) == undefined) {
                    minY = points[i].y;
                } else if (points[i].y < minY) {
                    minY = points[i].y;
                }
                if (typeof (maxX) == undefined) {
                    maxX = points[i].x;
                } else if (points[i].x > maxX) {
                    maxX = points[i].x;
                }
                if (typeof (maxY) == undefined) {
                    maxY = points[i].y;
                } else if (points[i].y > maxY) {
                    maxY = points[i].y;
                }
            }
            break;
        default:
            minX = this.left;
            minY = this.top;
            maxX = this.left + this.width;
            maxY = this.top + this.height;
    }
    return {
        topLeft: new fabric.Point(minX, minY),
        bottomRight: new fabric.Point(maxX, maxY),
        width: maxX - minX,
        height: maxY - minY
    }
}

// called after a selection is made on the canvas
canvas.on('selection:created', function (options) {
    if (canvas.getActiveObjects().length > 1) {
        updateSelection();
        for (var i = options.selected.length - 1; i >= 0; i--) {
            if (options.selected[i].objType === 'link' || options.selected[i].locked) {
                canvas.getActiveObject().removeWithUpdate(options.selected[i]);
            }
        }
    }
});

// ---------------------------- Canvas Events  ----------------------------------
canvas.on('object:rotating', function (options) {
    var step = 5;
    options.target.set({
        angle: Math.round(options.target.angle / step) * step,
    });
});

// called when an object is moving on the canvas
canvas.on('object:moving', function (options) {
    var o = options.target;
    var grid = 5;

    o.set({
        left: Math.round(o.left / grid) * grid,
        top: Math.round(o.top / grid) * grid
    });

    var zoom = canvas.getZoom();
    var tmod = 0;
    var lmod = 0;
    if (canvas.getActiveObjects().length > 1) {
        tmod = o.top + o.height / 2;
        lmod = o.left + o.width / 2;
    }

    drawAlignmentGuides(o, 1);
    o = canvas.getActiveObjects();
    for (var i = 0; i < o.length; i++) {
        o[i].dirty = true;
        for (var j = 0; j < o[i].children.length; j++) {
            if (o[i].children[j].objType === 'name') {
                o[i].children[j].set('top', o[i].top + tmod + o[i].height * o[i].scaleY + 4);
                o[i].children[j].set('left', o[i].left + lmod + (o[i].width * o[i].scaleX) / 2);
                o[i].children[j].setCoords();
            } else if (o[i].children[j].objType === 'link') {
                drawLink(o[i].children[j]);
            }
        }
    }
});

canvas.on('object:scaling', function (options) {
    var o = options.target;

    var tmod = 0;
    var lmod = 0;
    if (canvas.getActiveObjects().length > 1) {
        tmod = options.target.top + options.target.height / 2;
        lmod = options.target.left + options.target.width / 2;
    }

    var w = o.width * o.scaleX;
    var h = o.height * o.scaleY;

    if (!o.savedRight) {
        o.savedRight = o.left + w;
    }

    if (!o.savedBottom) {
        o.savedBottom = o.top + h;
    }

    var grid = 5;

    var snap = {      // Closest snapping points
        top: Math.round(o.top / grid) * grid,
        left: Math.round(o.left / grid) * grid,
        bottom: Math.round((o.top + h) / grid) * grid,
        right: Math.round((o.left + w) / grid) * grid
    };

    var threshold = 2.5;

    var dist = {      // Distance from snapping points
        top: Math.abs(snap.top - o.top),
        left: Math.abs(snap.left - o.left),
        bottom: Math.abs(snap.bottom - o.top - h),
        right: Math.abs(snap.right - o.left - w)
    };

    var attrs = {
        scaleX: o.scaleX,
        scaleY: o.scaleY,
        top: o.top,
        left: o.left
    };

    switch (o.__corner) {
        case 'tl':
                if (dist.top < threshold) {
                    attrs.top = snap.top;
                    attrs.scaleY = Math.abs((attrs.top - o.savedBottom) / o.height);
                }
        case 'ml':
                if (dist.left < threshold) {
                    attrs.left = snap.left;
                    attrs.scaleX = Math.abs((attrs.left - o.savedRight) / o.width);
                }
        break;

        case 'mt':
                if (dist.top < threshold) {
                    attrs.top = snap.top;
                    attrs.scaleY = Math.abs((attrs.top - o.savedBottom) / o.height);
                }
        break;
        
        case 'tr':
            if (dist.top < threshold) {
                attrs.top = snap.top;
                attrs.scaleY = Math.abs((attrs.top - o.savedBottom) / o.height);
            }
        case 'mr':
                if (dist.right < threshold) {
                    attrs.scaleX = (snap.right - o.left) / o.width;
                }
        break;

        case 'br':
                if (dist.right < threshold) {
                    attrs.scaleX = (snap.right - o.left) / o.width;
                }
                if (dist.bottom < threshold) {
                    attrs.scaleY = (snap.bottom - o.top) / o.height;
                }
        break;
        
        case 'bl':
            if (dist.left < threshold) {
                attrs.scaleX = (w - (snap.left - o.left)) / o.width;
                attrs.left = snap.left;
            }
       case 'mb':
            if (dist.bottom < threshold) {
                attrs.scaleY = (snap.bottom - o.top) / o.height;
            }
        break;
    }

    o.set(attrs);

    $('#objectWidth').val(Math.round(o.width * o.scaleX));
    $('#objectHeight').val(Math.round(o.height * o.scaleY));
    drawAlignmentGuides(o, 1);
    var o = canvas.getActiveObjects();
    for (var i = 0; i < o.length; i++) {
        o[i].dirty = true;
        for (var j = 0; j < o[i].children.length; j++) {
            if (o[i].children[j].objType === 'name') {
                o[i].children[j].set('top', o[i].top + tmod + o[i].height * o[i].scaleY + 4);
                o[i].children[j].set('left', o[i].left + lmod + (o[i].width * o[i].scaleX) / 2);
                o[i].children[j].setCoords();
            } else if (o[i].children[j].objType === 'link') {
                drawLink(o[i].children[j]);
            }
        }
    }
});

canvas.on('object:modified', function (options) {
    objectModified(options.target);
});

// called when an existing selection is changed on the canvas (ie more icons added / removed)
canvas.on('selection:updated', function (options) {
    updateSelection(options);
});

// called when an object is selected
canvas.on('object:selected', function (options) {
    updateSelection(options);
});

// called before everything on the canvas is deslected
canvas.on('before:selection:cleared', function (options) {
    updatePropName($('#propName').val())
    updateSelection();
});


// set up a listener for the event where the object has been modified
// this is used to allow shapes to resize and retain a 1px border
canvas.observe('object:modified', function (e) {
    if (e.target !== undefined && e.target.resizeToScale)
        e.target.resizeToScale();
});


// ---------------------------- Canvas Functions ----------------------------------
function objectModified(o) {
    var tmod = 0;
    var lmod = 0;
    if (o.objType === 'icon') {
        o.set({
            scaleX: Math.round(o.width * o.scaleX) / o.width,
            scaleY: Math.round(o.height * o.scaleY) / o.height
        });
    } else if (o.objType === 'shape') {
        o.set({
            width: Math.round(o.width),
            height: Math.round(o.height)
        });
    }

    o.set({
        left: Math.round(o.left),
        top: Math.round(o.top)
    });

    delete o.savedRight;
    delete o.savedBottom;

    if (canvas.getActiveObjects().length > 1) {
        tmod = o.top + o.height / 2;
        lmod = o.left + o.width / 2;
    }

    // remove the guides
    for (var k in guides) {
        if (guides.hasOwnProperty(k)) {
            canvas.remove(guides[k]);
            delete guides[k];
        }
    }

    // compile changes for db
    o = canvas.getActiveObjects();
    var args = []
    for (var i = 0; i < o.length; i++) {
        var z = canvas.getObjects().indexOf(o[i]) / 2;
        if (o[i].objType === 'link')
            args.push({
                _id: o[i]._id,
                x: 0,
                y: 0,
                z: z,
                scale_x: 0,
                scale_y: 0,
                rot: 0
            });
        else if (o[i].objType === 'icon') {
            args.push({
                _id: o[i]._id,
                x: lmod + o[i].left,
                y: tmod + o[i].top,
                z: z,
                scale_x: o[i].scaleX,
                scale_y: o[i].scaleY,
                rot: o[i].angle
            });
        } else if (o[i].objType === 'shape')
            args.push({
                _id: o[i]._id,
                x: lmod + o[i].left,
                y: tmod + o[i].top,
                z: z,
                scale_x: o[i].width,
                scale_y: o[i].height,
                rot: o[i].angle
            });
    }

    // update minimap
    updateMinimapBg();
    // send changes to db
    socket.send(JSON.stringify({
        act: 'move_object',
        arg: args,
        msgId: msgHandler()
    }));
}

// updates the two sides of all links
// necessary because sometimes items are added / removed before or after the icon is rx'ed
function updateLinks() {
    for (var i = 0; i < canvas.getObjects().length; i++) {
        var link = canvas.item(i);
        if (link.objType && link.objType === 'link') {
            updateLink(link);
        }
    }
}

// worker portion of above
function updateLink(link) {
    var foundFrom = false;
    var foundTo = false;
    for (var j = 0; j < canvas.getObjects().length; j++) {
        var jo = canvas.item(j);
        if (!foundFrom && jo._id == link.fromId) {
            link.fromObj = jo;
            if (jo.children.indexOf(link) === -1)
                jo.children.push(link);
            foundFrom = true;
        } else if (!foundTo && jo._id == link.toId) {
            link.toObj = jo;
            if (jo.children.indexOf(link) === -1)
                jo.children.push(link);
            foundTo = true;
        }

    }
    if (foundFrom && foundTo)
        drawLink(link);
    return (foundFrom && foundTo);
}

function setObjectLock(o, l) {
    o.set({
        hasControls: !l,
        lockMovementX: l,
        lockMovementY: l,
        lockScalingX: l,
        lockScalingY: l,
        lockRotation: 0
    });
}

function getObjectCenter(o) {
    var x = (o.width * o.scaleX) / 2 + o.left;
    var y = (o.height * o.scaleY) / 2 + o.top;
    return {
        x: x,
        y: y
    };
}

function startPan(event) {
    if (event.button != 2) {
        return;
    }
    var x0 = event.screenX;
    var y0 = event.screenY;
    canvas.isDragging = true;
    canvas.selection = false;

    function continuePan(event) {
        var x = event.screenX,
            y = event.screenY;
        if (x - x0 != 0 || y - y0 != 0) {
            var deltaX = x - x0;
            var deltaY = y - y0;
            var zoom = canvas.getZoom();
            if (canvas.viewportTransform[4] + deltaX > MAXWIDTH * zoom)
                deltaX = Math.round(MAXWIDTH * zoom - canvas.viewportTransform[4]);
            else if (canvas.viewportTransform[4] - canvas.width + deltaX < -MAXWIDTH * zoom)
                deltaX = Math.round(-MAXWIDTH * zoom - canvas.viewportTransform[4] + canvas.width);
            if (canvas.viewportTransform[5] + deltaY > MAXHEIGHT * zoom)
                deltaY = Math.round(MAXHEIGHT * zoom - canvas.viewportTransform[5]);
            else if (canvas.viewportTransform[5] - canvas.height + deltaY < -MAXHEIGHT * zoom)
                deltaY = Math.round(-MAXHEIGHT * zoom - canvas.viewportTransform[5] + canvas.height);
            canvas.relativePan({
                x: deltaX,
                y: deltaY
            });
            x0 = x;
            y0 = y;
            settings.x = Math.round(canvas.viewportTransform[4]);
            settings.y = Math.round(canvas.viewportTransform[5]);
            canvas.requestRenderAll();
            updateMinimap();
        }
    }

    function stopPan(event) {
        canvas.isDragging = false;
        canvas.selection = true;
        updateSettings();
        $(window).off('mousemove', continuePan);
        $(window).off('mouseup', stopPan);
    };
    $(window).mousemove(continuePan);
    $(window).mouseup(stopPan);
    $(window).contextmenu(cancelMenu);
};

// ---------------------------- Links and Guides  ----------------------------------
function drawAlignmentGuides(o, snap) {
    var vSnap = snap;
    var hSnap = snap;
    var zoom = canvas.getZoom();
    // alignment markers
    var hAligned = false;
    var vAligned = false;
    var tAligned = false;
    var bAligned = false;
    var lAligned = false;
    var rAligned = false;
    var hSpaced = false;
    var vSpaced = false;
    var hAlignedObjects = [];
    var vAlignedObjects = [];

    for (var i = 0; i < canvas.getObjects().length; i++) {
        if (canvas.item(i).isOnScreen() && (canvas.item(i).objType && canvas.item(i).objType === 'icon' || canvas.item(i).objType && canvas.item(i).objType === 'shape') && canvas.getActiveObjects().indexOf(canvas.item(i)) === -1) {

            // middle vert alignment guide
            if (Math.round(getObjectCenter(canvas.item(i)).x) <= Math.ceil(getObjectCenter(o).x) + vSnap && Math.round(getObjectCenter(canvas.item(i)).x) >= Math.floor(getObjectCenter(o).x) - vSnap) {
                if (canvas.item(i).top + canvas.item(i).height * canvas.item(i).scaleY < o.top || canvas.item(i).top > o.top + o.height * o.scaleY)
                    vAlignedObjects.push(canvas.item(i));

                if (!vAligned) {
                    if (vSnap > 1)
                        o.set({
                            left: Math.round(canvas.item(i).left + (canvas.item(i).width * canvas.item(i).scaleX) / 2 - (o.width * o.scaleX) / 2)
                        });
                    vAligned = true;
                    vSnap = 0;
                    if (!guides.vGuide) {
                        var line = new fabric.Line([getObjectCenter(o).x, -canvas.viewportTransform[5] / zoom, getObjectCenter(o).x, (-canvas.viewportTransform[5] + canvas.height) / zoom], {
                            objType: 'guide',
                            stroke: '#66bfff',
                            strokeColor: '#66bfff',
                            strokeDashArray: [2, 2],
                            strokeWidth: 1,
                            selectable: false,
                            evented: false
                        });
                        canvas.add(line);
                        guides.vGuide = line;
                    }
                }
            }

            // left alignment mark
            if (!lAligned && (Math.round(canvas.item(i).left) <= Math.round(o.left) + vSnap && Math.round(canvas.item(i).left) >= Math.round(o.left) - vSnap)) {
                console.log('left');
                if (vSnap > 1 && !vAligned)
                    o.set({
                        left: canvas.item(i).left
                    });
                lAligned = true;
                vSnap = 0;
                if (!guides.lGuide) {
                    var line = new fabric.Line([o.left, -canvas.viewportTransform[5] / zoom, o.left, (-canvas.viewportTransform[5] + canvas.height) / zoom], {
                        objType: 'guide',
                        stroke: '#bf66ff',
                        strokeColor: '#bf66ff',
                        strokeDashArray: [2, 2],
                        strokeWidth: 1,
                        selectable: false,
                        evented: false
                    });
                    canvas.add(line);
                    guides.lGuide = line;
                }
            }

            // right alignment mark
            if (!rAligned && (Math.round(canvas.item(i).left + canvas.item(i).width * canvas.item(i).scaleX) <= Math.round(o.left + o.width * o.scaleX) + vSnap && Math.round(canvas.item(i).left + canvas.item(i).width * canvas.item(i).scaleX) >= Math.round(o.left + o.width * o.scaleX) - vSnap)) {
                if (vSnap > 1 && !vAligned && !lAligned)
                    o.set({
                        left: canvas.item(i).left + canvas.item(i).width * canvas.item(i).scaleX - (o.width * o.scaleX)
                    });
                rAligned = true;
                if (!guides.rGuide) {
                    var line = new fabric.Line([o.left + (o.width * o.scaleX) + 1, -canvas.viewportTransform[5] / zoom, o.left + (o.width * o.scaleX) + 1, (-canvas.viewportTransform[5] + canvas.height) / zoom], {
                        objType: 'guide',
                        stroke: '#bf66ff',
                        strokeColor: '#bf66ff',
                        strokeDashArray: [2, 2],
                        strokeWidth: 1,
                        selectable: false,
                        evented: false
                    });
                    canvas.add(line);
                    guides.rGuide = line;
                }
            }

            // middle horiz alignment guide
            if (Math.round(getObjectCenter(canvas.item(i)).y) <= Math.round(getObjectCenter(o).y) + hSnap && Math.round(getObjectCenter(canvas.item(i)).y) >= Math.round(getObjectCenter(o).y) - hSnap) {
                if (canvas.item(i).left + canvas.item(i).width * canvas.item(i).scaleX < o.left || canvas.item(i).left > o.left + o.width * o.scaleX)
                    hAlignedObjects.push(canvas.item(i));
                if (!hAligned) {
                    if (hSnap > 1)
                        o.set({
                            top: Math.round(canvas.item(i).top + (canvas.item(i).height * canvas.item(i).scaleY) / 2 - (o.height * o.scaleY) / 2)
                        });
                    hAligned = true;
                    hSnap = 0;
                    if (!guides.hGuide) {
                        var line = new fabric.Line([-canvas.viewportTransform[4] / zoom, getObjectCenter(o).y, (-canvas.viewportTransform[4] + canvas.width) / zoom, getObjectCenter(o).y], {
                            objType: 'guide',
                            stroke: '#66bfff',
                            strokeColor: '#66bfff',
                            strokeDashArray: [2, 2],
                            strokeWidth: 1,
                            selectable: false,
                            evented: false
                        });
                        canvas.add(line);
                        guides.hGuide = line;
                    }
                }
            }

            // top alignment guide
            if (!tAligned && (Math.round(canvas.item(i).top) <= Math.round(o.top) + hSnap && Math.round(canvas.item(i).top) >= Math.round(o.top) - hSnap)) {
                if (hSnap > 1)
                    o.set({
                        top: canvas.item(i).top
                    });
                hSnap = 0;
                tAligned = true;
                if (!guides.tGuide) {
                    var line = new fabric.Line([-canvas.viewportTransform[4] / zoom, o.top, (-canvas.viewportTransform[4] + canvas.width) / zoom, o.top], {
                        objType: 'guide',
                        stroke: '#bf66ff',
                        strokeColor: '#bf66ff',
                        strokeDashArray: [2, 2],
                        strokeWidth: 1,
                        selectable: false,
                        evented: false
                    });
                    canvas.add(line);
                    guides.tGuide = line;
                }
            }

            // bottom alignment guide
            if (!bAligned && (Math.round(canvas.item(i).top + canvas.item(i).height * canvas.item(i).scaleY) <= Math.round(o.top + (o.height * o.scaleY)) + hSnap && Math.round(canvas.item(i).top + canvas.item(i).height * canvas.item(i).scaleY) >= Math.round(o.top + (o.height * o.scaleY)) - hSnap)) {
                if (hSnap > 1)
                    o.set({
                        top: canvas.item(i).top + canvas.item(i).height * canvas.item(i).scaleY - o.height * o.scaleY
                    });
                hSnap = 0;
                bAligned = true;
                if (!guides.bGuide) {
                    var line = new fabric.Line([-canvas.viewportTransform[4] / zoom, o.top + (o.height * o.scaleY) + 1, (-canvas.viewportTransform[4] + canvas.width) / zoom, o.top + (o.height * o.scaleY) + 1], {
                        objType: 'guide',
                        stroke: '#bf66ff',
                        strokeColor: '#bf66ff',
                        strokeDashArray: [2, 2],
                        strokeWidth: 1,
                        selectable: false,
                        evented: false
                    });
                    canvas.add(line);
                    guides.bGuide = line;
                }
            }
        }
    }
    if (hAlignedObjects.length > 1) {
        hAlignedObjects.push(o);
        hAlignedObjects.sort(function (a, b) {
            return (a.left > b.left) ? 1 : ((b.left <= a.left) ? -1 : 0);
        });
        var idx = hAlignedObjects.indexOf(o);
        var alignedIcons = null;
        // right
        if (idx > 1 && Math.round(getObjectCenter(hAlignedObjects[idx - 2]).x) - Math.round(getObjectCenter(hAlignedObjects[idx - 1]).x) >= Math.round(getObjectCenter(hAlignedObjects[idx - 1]).x) - Math.round(getObjectCenter(hAlignedObjects[idx]).x) - vSnap && Math.round(getObjectCenter(hAlignedObjects[idx - 2]).x) - Math.round(getObjectCenter(hAlignedObjects[idx - 1]).x) <= Math.round(getObjectCenter(hAlignedObjects[idx - 1]).x) - Math.round(getObjectCenter(hAlignedObjects[idx]).x) + vSnap) {
            o.set({
                left: Math.round(getObjectCenter(hAlignedObjects[idx - 1]).x - (getObjectCenter(hAlignedObjects[idx - 2]).x) + Math.round(getObjectCenter(hAlignedObjects[idx - 1]).x) - o.width / 2)
            });
            alignedIcons = [idx - 2, idx - 1, idx];
            hSpaced = true;
        } else if (idx < hAlignedObjects.length - 2 && Math.round(getObjectCenter(hAlignedObjects[idx + 1]).x) - Math.round(getObjectCenter(hAlignedObjects[idx + 2]).x) >= Math.round(getObjectCenter(hAlignedObjects[idx]).x) - Math.round(getObjectCenter(hAlignedObjects[idx + 1]).x) - vSnap && Math.round(getObjectCenter(hAlignedObjects[idx + 1]).x) - Math.round(getObjectCenter(hAlignedObjects[idx + 2]).x) <= Math.round(getObjectCenter(hAlignedObjects[idx]).x) - Math.round(getObjectCenter(hAlignedObjects[idx + 1]).x) + vSnap) {
            o.set({
                left: Math.round(getObjectCenter(hAlignedObjects[idx + 1]).x - (Math.round(getObjectCenter(hAlignedObjects[idx + 2]).x) - getObjectCenter(hAlignedObjects[idx + 1]).x) - o.width / 2)
            });
            alignedIcons = [idx, idx + 1, idx + 2];
            hSpaced = true;
        } else if (idx > 0 && idx < hAlignedObjects.length - 1 && Math.round(getObjectCenter(hAlignedObjects[idx - 1]).x) - Math.round(getObjectCenter(hAlignedObjects[idx]).x) >= Math.round(getObjectCenter(hAlignedObjects[idx]).x) - Math.round(getObjectCenter(hAlignedObjects[idx + 1]).x) - vSnap && hAlignedObjects.length - 1 && Math.round(getObjectCenter(hAlignedObjects[idx - 1]).x) - Math.round(getObjectCenter(hAlignedObjects[idx]).x) <= Math.round(getObjectCenter(hAlignedObjects[idx]).x) - Math.round(getObjectCenter(hAlignedObjects[idx + 1]).x) + vSnap) {
            o.set({
                left: Math.round(getObjectCenter(hAlignedObjects[idx + 1]).x - (getObjectCenter(hAlignedObjects[idx + 1]).x - (getObjectCenter(hAlignedObjects[idx - 1]).x)) / 2 - o.width / 2)
            });
            alignedIcons = [idx - 1, idx, idx + 1];
            hSpaced = true;
        }
        if (alignedIcons && !guides.hSGuide) {
            var hSGuide = [];
            var line = new fabric.Line([getObjectCenter(hAlignedObjects[alignedIcons[0]]).x, getObjectCenter(hAlignedObjects[alignedIcons[0]]).y - 10, getObjectCenter(hAlignedObjects[alignedIcons[0]]).x, getObjectCenter(hAlignedObjects[alignedIcons[0]]).y + 10], {
                objType: 'guide',
                stroke: '#ff1111',
                strokeColor: '#ff1111',
                strokeDashArray: [2, 2],
                strokeWidth: 2,
                selectable: false,
                evented: false
            });
            hSGuide.push(line);
            line = new fabric.Line([getObjectCenter(hAlignedObjects[alignedIcons[1]]).x, getObjectCenter(hAlignedObjects[alignedIcons[1]]).y - 10, getObjectCenter(hAlignedObjects[alignedIcons[1]]).x, getObjectCenter(hAlignedObjects[alignedIcons[1]]).y + 10], {
                objType: 'guide',
                stroke: '#ff1111',
                strokeColor: '#ff1111',
                strokeDashArray: [2, 2],
                strokeWidth: 2,
                selectable: false,
                evented: false
            });
            hSGuide.push(line);
            line = new fabric.Line([getObjectCenter(hAlignedObjects[alignedIcons[2]]).x, getObjectCenter(hAlignedObjects[alignedIcons[2]]).y - 10, getObjectCenter(hAlignedObjects[alignedIcons[2]]).x, getObjectCenter(hAlignedObjects[alignedIcons[2]]).y + 10], {
                objType: 'guide',
                stroke: '#ff1111',
                strokeColor: '#ff1111',
                strokeDashArray: [2, 2],
                strokeWidth: 2,
                selectable: false,
                evented: false
            });
            hSGuide.push(line);
            line = new fabric.Line([getObjectCenter(hAlignedObjects[alignedIcons[0]]).x, getObjectCenter(hAlignedObjects[alignedIcons[0]]).y, getObjectCenter(hAlignedObjects[alignedIcons[2]]).x, getObjectCenter(hAlignedObjects[alignedIcons[2]]).y], {
                objType: 'guide',
                stroke: '#ff1111',
                strokeColor: '#ff1111',
                strokeDashArray: [2, 2],
                strokeWidth: 2,
                selectable: false,
                evented: false
            });
            hSGuide.push(line);
            guides.hSGuide = new fabric.Group(hSGuide);
            canvas.add(guides.hSGuide);
        }
    }
    if (!lAligned && guides.lGuide) {
        canvas.remove(guides.lGuide);
        delete guides.lGuide;
    }
    if (!rAligned && guides.rGuide) {
        canvas.remove(guides.rGuide);
        delete guides.rGuide;
    }
    if (!bAligned && guides.bGuide) {
        canvas.remove(guides.bGuide);
        delete guides.bGuide;
    }
    if (!tAligned && guides.tGuide) {
        canvas.remove(guides.tGuide);
        delete guides.tGuide;
    }
    if (!hAligned && guides.hGuide) {
        canvas.remove(guides.hGuide);
        delete guides.hGuide;
    }
    if (!vAligned && guides.vGuide) {
        canvas.remove(guides.vGuide);
        delete guides.vGuide;
    }
    if (!hSpaced && guides.hSGuide) {
        canvas.remove(guides.hSGuide);
        delete guides.hSGuide;
    }
    return;
}

// render all links including temporary links for event tracking
function drawLinks() {
    for (var i = 0; i < canvas.getObjects().length; i++) {
        var link = canvas.item(i);
        if (link.objType && link.objType === 'link') {
            drawLink(link);
        }
    }
    for (var i = 0; i < tempLinks.length; i++) {
        if (tempLinks[i].objType === 'link') {
            tempLinks[i].set({
                'x1': tempLinks[i].getObjectCenter(from).x,
                'y1': tempLinks[i].getObjectCenter(from).y
            });
            tempLinks[i].set({
                'x2': tempLinks[i].getObjectCenter(to).x,
                'y2': tempLinks[i].getObjectCenter(to).y
            });
        } else if (tempLinks[i].objType === 'shape') {
            tempLinks[i].set({
                top: tempLinks[i].dad.top - 7.5,
                left: tempLinks[i].dad.left - 7.5
            });
        }
    }
}

// draw a specific link
function drawLink(link) {
    if (link.toObj && link.fromObj) {
        var fromAbs = link.fromObj.calcTransformMatrix();
        var toAbs = link.toObj.calcTransformMatrix();
        link.set({
            'x1': fromAbs[4],
            'y1': fromAbs[5]
        });
        link.set({
            'x2': toAbs[4],
            'y2': toAbs[5]
        });
        link.setCoords();
        for (var j = 0; j < link.children.length; j++) {
            if (link.children[j].objType === 'name') {
                link.children[j].set({
                    'left': getObjectCenter(link).x,
                    'top': getObjectCenter(link).y
                });
                var angle = Math.atan2((link.y1 - link.y2), (link.x1 - link.x2)) * (180 / Math.PI);
                if (Math.abs(angle) > 90)
                    angle += 180;
                link.children[j].set({
                    'angle': angle
                });
                link.children[j].setCoords();
            }
        }
    }
}


// ---------------------------- OBJECT SEARCHING / FOCUSING ----------------------------------
function objectSearch(s) {
    objectSearchResults = [];
    objectSearchPtr = -1;
    for (var i = 0; i < canvas.getObjects().length; i++) {
        if (canvas.item(i).name_val !== undefined && canvas.item(i).name_val.toLowerCase().indexOf(s.toLowerCase()) !== -1) {
            objectSearchResults.push(canvas.item(i));
        }
    }
    nextObjectSearch();
}

function nextObjectSearch() {
    if (objectSearchResults.length > 0) {
        objectSearchPtr++;
        if (objectSearchPtr >= objectSearchResults.length || objectSearchPtr < 0)
            objectSearchPtr = 0;
        $('#foundCount').text(objectSearchPtr + 1 + '/' + objectSearchResults.length);
        $('#foundCount').show();
        focusObject(objectSearchResults[objectSearchPtr]);
        canvas.setActiveObject(objectSearchResults[objectSearchPtr]);
    } else {
        $('#foundCount').hide();
    }
}

function prevObjectSearch() {
    if (objectSearchResults.length > 0) {
        objectSearchPtr--;
        if (objectSearchPtr < 0)
            objectSearchPtr = objectSearchResults.length - 1;
        $('#foundCount').text(objectSearchPtr + 1 + '/' + objectSearchResults.length);
        focusObject(objectSearchResults[objectSearchPtr]);
        canvas.setActiveObject(objectSearchResults[objectSearchPtr]);
    }
}

function focusObject(o) {
    var center = getObjectCenter(o);
    center.x = center.x * canvas.getZoom() - canvas.width / 2 + $('#toolbar').width() / 2;
    center.y = center.y * canvas.getZoom() - canvas.height / 2;
    canvas.absolutePan(center);
    updateMinimap();
    updateSettings();
}

// zoom in, duh
function zoomIn() {
    if (canvas.getZoom() > 2.0)
        return;
    canvas.zoomToPoint(new fabric.Point(canvas.width / 2, canvas.height / 2), (canvas.getZoom() * 1.1).round(2));
    settings.x = Math.round(canvas.viewportTransform[4]);
    settings.y = Math.round(canvas.viewportTransform[5]);
    settings.zoom = canvas.getZoom();
    updateMinimap();
    updateSettings();
}

// zoom out, duh
function zoomOut() {
    if (canvas.getZoom() < 0.6)
        return;
    canvas.zoomToPoint(new fabric.Point(canvas.width / 2, canvas.height / 2), (canvas.getZoom() / 1.1).round(2));
    settings.x = Math.round(canvas.viewportTransform[4]);
    settings.y = Math.round(canvas.viewportTransform[5]);
    settings.zoom = canvas.getZoom();
    updateSettings();
    var deltaX = 0;
    var deltaY = 0;
    var zoom = canvas.getZoom();
    if (canvas.viewportTransform[4] > MAXWIDTH * zoom)
        deltaX = Math.round(MAXWIDTH * zoom - canvas.viewportTransform[4]);
    else if (canvas.viewportTransform[4] - canvas.width < -MAXWIDTH * zoom)
        deltaX = Math.round(-MAXWIDTH * zoom - canvas.viewportTransform[4] + canvas.width);
    if (canvas.viewportTransform[5] > MAXHEIGHT * zoom)
        deltaY = Math.round(MAXHEIGHT * zoom - canvas.viewportTransform[5]);
    else if (canvas.viewportTransform[5] - canvas.height < -MAXHEIGHT * zoom)
        deltaY = Math.round(-MAXHEIGHT * zoom - canvas.viewportTransform[5] + canvas.height);
    if (deltaX !== 0 || deltaY !== 0)
        canvas.relativePan({
            x: deltaX,
            y: deltaY
        });
    updateMinimap();
}

function addObjectToCanvas(o, selected, cb) {
    if (o.type === 'link') {
        if (o.stroke_color === '') // don't allow links to disappear
            o.stroke_color = '#000000';
        var line = new fabric.Line([0, 0, 0, 0], {
            _id: o._id,
            objType: 'link',
            image: o.image,
            name_val: o.name,
            fromId: o.obj_a,
            toId: o.obj_b,
            fill: '#eeeeee',
            stroke: o.stroke_color,
            strokeWidth: 3,
            hasControls: false,
            selctable: true,
            locked: true,
            lockMovementX: true,
            lockMovementY: true,
            lockScalingX: true,
            lockScalingY: true,
            lockRotation: true,
        });

        var name = new fabric.Text(o.name, {
            parent_id: o._id,
            parent: line,
            objType: 'name',
            selectable: false,
            originX: 'center',
            originY: 'top',
            textAlign: 'center',
            fill: '#eeeeee',
            angle: 0,
            fontSize: 12,
            fontFamily: 'verdana',
            left: line.getCenterPoint().x,
            top: line.getCenterPoint().y
        });
        line.children = [name];
        canvas.add(line);
        canvas.add(name);
        line.moveTo(o.z * 2);
        name.moveTo(o.z * 2 + 1);
        updateLink(line);
    } else if (o.type === 'icon' && o.image !== undefined && o.image !== null) {
        getIcon(o.image, function () {
            SVGCache[o.image].clone(function (shape) {
                var name;
                var scale_x = (Math.ceil((o.scale_x * shape.width)/5) * 5) / shape.width;
                var scale_y = (Math.ceil((o.scale_y * shape.height)/5) * 5) / shape.height;
                shape.set({
                    fill: o.fill_color,
                    stroke: o.stroke_color,
                    strokeWidth: 1,
                    scaleX: scale_x ,
                    scaleY: scale_y,
                    angle: o.rot,
                    _id: o._id,
                    objType: o.type,
                    image: o.image,
                    name_val: o.name,
                    originX: 'left',
                    originY: 'top',
                    left: o.x,
                    top: o.y,
                    locked: o.locked,
                    hasControls: !(!permissions.write_access ? true : o.locked),
                    lockMovementX: !permissions.write_access ? true : o.locked,
                    lockMovementY: !permissions.write_access ? true : o.locked,
                    lockScalingX: !permissions.write_access ? true : o.locked,
                    lockScalingY: !permissions.write_access ? true : o.locked,
                    lockRotation: true
                });
                shape.setControlVisible('mtr', false);
                if (shape._objects && !shape.image.includes('static')) {
                    for (var i = 0; i < shape._objects.length; i++) {
                        var fill = shape._objects[i].fill;
                        var fillAlpha = 1.0;
                        try {
                            if (fill.split("(")[1].split(")")[0].split(",")[3] < 1)
                                fillAlpha = 1 - fill.split("(")[1].split(")")[0].split(",")[3];
                        } catch (e) {}
                        if (shape._objects[i].fill != '#FFFFFF' && shape._objects[i].fill !== 'rgba(255,255,255,1)' && shape._objects[i].fill !== 'rgba(254,254,254,1)' && shape._objects[i].fill !== '') {
                            var color = '#' + rgba2rgb(o.fill_color, fillAlpha);
                            shape._objects[i].set('fill', color);
                        }
                        if (o.stroke_color !== '' && shape._objects[i].stroke !== 'rgba(254,254,254,1)') {
                            shape._objects[i].set('stroke', o.stroke_color);
                        }
                    }
                }
                name = new fabric.Text(o.name, {
                    parent_id: o._id,
                    parent: shape,
                    objType: 'name',
                    selectable: false,
                    originX: 'center',
                    originY: 'top',
                    textAlign: 'center',
                    fill: '#eeeeee',
                    fontSize: 12,
                    fontFamily: 'lato',
                    left: o.x + (shape.width * shape.scaleX) / 2,
                    top: o.y + shape.height * shape.scaleY + 4
                });
                shape.children = [name];
                canvas.add(shape);
                canvas.add(name);
                if (selected === 'single')
                    canvas.setActiveObject(shape);
                else if (selected === 'group')
                    canvas.getActiveObject().addWithUpdate(shape);
                shape.moveTo(o.z * 2);
                name.moveTo(o.z * 2 + 1);
                if (cb)
                    cb();
            });
        });
    } else if (o.type === 'shape') {
        var shape = o.image.split('-')[3].split('.')[0];
        if (shape === 'rect') {
            shape = new fabric.Rect({
                width: o.scale_x,
                height: o.scale_y,
                angle: o.rot,
                fill: o.fill_color,
                stroke: o.stroke_color,
                strokeWidth: 2,
                _id: o._id,
                objType: o.type,
                image: o.image,
                name_val: o.name,
                name: name,
                originX: 'left',
                originY: 'top',
                left: o.x,
                top: o.y,
                locked: o.locked,
                hasControls: !(!permissions.write_access ? true : o.locked),
                lockMovementX: !permissions.write_access ? true : o.locked,
                lockMovementY: !permissions.write_access ? true : o.locked,
                lockScalingX: !permissions.write_access ? true : o.locked,
                lockScalingY: !permissions.write_access ? true : o.locked,
                lockRotation: true
            });
        } else if (shape === 'circle') {
            shape = new fabric.Ellipse({
                rx: o.scale_x / 2,
                ry: o.scale_y / 2,
                angle: o.rot,
                fill: o.fill_color,
                stroke: o.stroke_color,
                strokeWidth: 2,
                _id: o._id,
                objType: o.type,
                image: o.image,
                name_val: o.name,
                name: name,
                originX: 'left',
                originY: 'top',
                left: o.x,
                top: o.y,
                locked: o.locked,
                hasControls: !(!permissions.write_access ? true : o.locked),
                lockMovementX: !permissions.write_access ? true : o.locked,
                lockMovementY: !permissions.write_access ? true : o.locked,
                lockScalingX: !permissions.write_access ? true : o.locked,
                lockScalingY: !permissions.write_access ? true : o.locked,
                lockRotation: true
            });
        } else
            return;
        name = new fabric.Text(o.name, {
            parent_id: o._id,
            parent: shape,
            objType: 'name',
            selectable: false,
            originX: 'center',
            originY: 'top',
            textAlign: 'center',
            fill: '#000000',
            fontSize: 10,
            fontFamily: 'verdana',
            left: o.x + (shape.width * shape.scaleX) / 2,
            top: o.y + shape.height * shape.scaleY + 4
        });
        shape.children = [name];
        canvas.add(shape);
        canvas.add(name);
        if (selected === 'single')
            canvas.setActiveObject(shape);
        else if (selected === 'group')
            canvas.getActiveObjects().addWithUpdate(shape);
        shape.moveTo(o.z * 2);
        name.moveTo(o.z * 2 + 1);
    }
    objectsLoaded.pop();
}

function toggleObjectLock(l) {
    var o = canvas.getActiveObject();
    if (o) {
        o.locked = l;
        changeObject(o);
    }
}

// resize fabricjs canvas when window is resized
function resizeCanvas() {
    if (canvas.getHeight() != $('#diagram').height()) {
        canvas.setHeight($('#diagram').height());
    }
    if (canvas.getWidth() != $('#diagram').width()) {
        canvas.setWidth($('#diagram').width());
    }
    updateMinimap();
}

// ---------------------------- Object Messages ----------------------------------
function setObjectSize() {
    var o = canvas.getActiveObject();
    if (o) {
        if (o.objType === 'icon') {
            o.set('scaleX', $('#objectWidth').val() / o.width);
            o.set('scaleY', $('#objectHeight').val() / o.height);
        } else if (o.objType === 'shape') {
            o.set('width', $('#objectWidth').val());
            o.set('height', $('#objectHeight').val());
            o.resizeToScale();
            o.setCoords();
            for (var j = 0; j < o.children.length; j++) {
                if (o.children[j].objType === 'name') {
                    o.children[j].set('top', o.top + o.height * o.scaleY + 4);
                    o.children[j].set('left', o.left + (o.width * o.scaleX) / 2);
                    o.children[j].setCoords();
                }
            }
        }
        changeObject(o);
    }
}

// send object deletions to db
function deleteObject() {
    if (canvas.getActiveObject()._id) {
        socket.send(JSON.stringify({
            act: 'delete_object',
            arg: {
                _id: canvas.getActiveObject()._id
            },
            msgId: msgHandler()
        }));
    }
}

// send paste messages for pasted objects
function pasteObjects() {
    var center = new fabric.Point(canvas.width / 2, canvas.height / 2);
    var args = [];
    for (var i = 0; i < canvasClipboard.length; i++) {
        args.push({
            _id: canvasClipboard[i]._id,
            x: Math.round(center.x / canvas.getZoom() - settings.x / canvas.getZoom()) + canvasClipboard[i].x,
            y: Math.round(center.y / canvas.getZoom() - settings.y / canvas.getZoom()) + canvasClipboard[i].y,
            z: canvas.getObjects().length + canvasClipboard[i].z
        });
    }
    socket.send(JSON.stringify({
        act: 'paste_object',
        arg: args,
        msgId: msgHandler()
    }));
}

// move objects up / down on canvas
function moveToZ(o, z) {
    if (o) {
        if (o.objType === 'link')
            socket.send(JSON.stringify({
                act: 'move_object',
                arg: [{
                    _id: o._id,
                    scale_x: 0,
                    scale_y: 0,
                    x: 0,
                    y: 0,
                    z: z,
                    rot: 0
                }],
                msgId: msgHandler()
            }));
        else if (o.objType === 'icon')
            socket.send(JSON.stringify({
                act: 'move_object',
                arg: [{
                    _id: o._id,
                    x: o.left,
                    y: o.top,
                    z: z,
                    scale_x: o.scaleX,
                    scale_y: o.scaleY,
                    rot: o.angle
                }],
                msgId: msgHandler()
            }));
        else if (o.objType === 'shape')
            socket.send(JSON.stringify({
                act: 'move_object',
                arg: [{
                    _id: o._id,
                    x: o.left,
                    y: o.top,
                    z: z,
                    scale_x: o.width,
                    scale_y: o.height,
                    rot: o.angle
                }],
                msgId: msgHandler()
            }));
    }
}

function moveToFront() {
    var zTop = canvas.getObjects().length - tempLinks.length - 2;
    var o = canvas.getActiveObject();
    moveToZ(o, zTop / 2);
}

function moveToBack() {
    var o = canvas.getActiveObject();
    var z = 0;
    moveToZ(o, z);
}

function moveUp() {
    var o = canvas.getActiveObject();
    if (canvas.getActiveObject()._id && canvas.getObjects().indexOf(o) < canvas.getObjects().length - 2 - tempLinks.length) {
        var z = canvas.getObjects().indexOf(o) / 2 + 1;
        moveToZ(o, z);
    }
}

function moveDown() {
    var o = canvas.getActiveObject();
    if (canvas.getActiveObject()._id && canvas.getObjects().indexOf(o) > 0) {
        var z = canvas.getObjects().indexOf(o) / 2 - 1;
        moveToZ(o, z);
    }
}

// replace an objects icon with another or change an icon's colors
function changeObject(o) {
    var tempObj = {};
    tempObj._id = o._id;
    tempObj.x = o.left;
    tempObj.y = o.top;
    tempObj.z = canvas.getObjects().indexOf(o);
    tempObj.scale_x = o.scaleX;
    tempObj.scale_y = o.scaleY;
    tempObj.rot = o.angle;
    tempObj.type = o.objType;
    tempObj.fill_color = o.fill;
    tempObj.stroke_color = o.stroke;
    tempObj.image = o.image;
    tempObj.locked = o.locked;
    tempObj.name = '';
    for (var i = 0; i < o.children.length; i++) {
        if (o.children[i].objType === 'name') {
            tempObj.name = o.children[i].text;
        }
    }
    socket.send(JSON.stringify({
        act: 'change_object',
        arg: tempObj,
        msgId: msgHandler()
    }));
}