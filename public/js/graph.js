var graph;
var model = new mxGraphModel();
var graphSearchResults = [];
var graphSearchPtr = null;
var graphHighlights = [];
var graphCellsSelect = [{
    _id: '',
    name: ''
}];
var graphReady = false;

class JsonCodec extends mxObjectCodec {
    constructor() {
        super((value) => {});
    }
    encodeMxGeometry(value) {
        var res = {};
        for (let prop in value) {
            if (value[prop] !== undefined && value[prop] !== null && value[prop] !== false) {
                if (prop === 'x' || prop === 'y' || prop === 'width' || prop === 'height' || prop === 'sourcePoint' || prop === 'targetPoint' || prop == 'offset' || prop == 'points') {
                    res[prop] = value[prop];
                }
            }
        }
        return res;
    }

    encodeMxCell(value) {
        var res = {};
        for (let prop in value) {
            if (value[prop] !== undefined && value[prop] !== null && value[prop] !== false) {
                if (prop === 'id' || prop === 'style' || prop === 'value' || prop === 'vertex' || prop === 'edge') {
                    res[prop] = value[prop];
                }
                if (prop === 'parent') {
                    res[prop] = value[prop].id;
                }
                if (value[prop].constructor === mxGeometry) {
                    res['mxGeometry'] = this.encodeMxGeometry(value[prop]);
                }
            }
        }
        return res;
    }

    encode(value) {
        var type = value.constructor.name;
        var res = {
            type: type
        };
        res[type] = {};
        for (let prop in value) {
            if (value[prop] !== undefined && value[prop] !== null) {
                if (prop === 'child' && value.constructor === mxChildChange && value.previous !== null) {
                    res[type]['child'] = value.child.id;
                }
                if (prop === 'cell') {
                    res[type]['cell'] = value[prop].id;
                }
                if (prop === 'terminal') {
                    res[type]['terminal'] = value.terminal.id;
                }
                if (prop === 'source') {
                    res[type]['source'] = value[prop];
                }
                if (prop === 'parent') {
                    res[type][prop] = value[prop].id;
                }
                if (prop === 'value') {
                    res[type][prop] = value[prop];
                }
                if (prop === 'geometry' && value[prop].constructor === mxGeometry) {
                    res[type]['mxGeometry'] = this.encodeMxGeometry(value[prop]);
                }
                if (value.constructor === mxChildChange) {
                    if (prop === 'index' || prop === 'style' || prop === 'edge') {
                        res[type][prop] = value[prop];
                    }
                    if (value.previous !== null) {
                        res[type]['previous'] = value.previous.id;
                    }
                    if (value[prop].constructor === mxCell && value.previous === null) {
                        res[type]['mxCell'] = this.encodeMxCell(value[prop]);
                    }
                }
                if (value.constructor === mxStyleChange) {
                    res[type]['style'] = value.cell.style;
                }
            }
        }
        return res;
    }

    decode(value, type) {
        if (type === 'mxGraphModel') {
            var t = value['mxGraphModel'];
            var cells = [];

            if (t.root !== undefined && t.root.mxCell !== undefined) {
                model.beginUpdate();
                for (var i = 0; i < t.root.mxCell.length; i++) {
                    var cell = this.decode(t.root.mxCell[i], 'mxCell');
                    if (cell) {
                        cells.push(cell);
                        model.add(graph.getDefaultParent(), cells[i], i);
                    }
                }
                for (var i = 0; i < t.root.mxCell.length; i++) {
                    if (t.root.mxCell[i].edge) {
                        model.setTerminals(model.cells[t.root.mxCell[i].id], model.cells[t.root.mxCell[i].source], model.cells[t.root.mxCell[i].target]);
                    }
                }
                model.endUpdate();
            }
            return cells;

        } else if (type === 'mxCell') {
            var cell = null;
            var geometry = null;

            if (value['mxGeometry'] !== undefined) {
                geometry = this.decode(value['mxGeometry'], 'mxGeometry');
            }

            var cell = new mxCell(value.value, geometry, value.style);
            cell.id = value.id;
            cell.parent = undefined;
            if (value.edge) {
                cell.edge = 1;
            }
            if (value.vertex) {
                cell.vertex = 1;
            }
            if (value.target) {
                cell.target = this.lookup(value.target);
            }
            if (value.source) {
                cell.source = this.lookup(value.source);
            }
            return cell;

        } else if (type === 'mxGeometry') {
            var geometry = new mxGeometry(value.x, value.y, value.width, value.height);
            if (geometry) {
                if (value.sourcePoint) {
                    var sp = new mxPoint(value.sourcePoint.x, value.sourcePoint.y);
                    geometry.sourcePoint = sp;
                }
                if (value.sourcePoint) {
                    var tp = new mxPoint(value.targetPoint.x, value.targetPoint.y);
                    geometry.targetPoint = tp;
                }
                if (value.offset) {
                    var op = new mxPoint(value.offset.x, value.offset.y);
                    geometry.offset = op;
                }
                if (value.points) {
                    geometry.points = [];
                    for (var i = 0; i < value.points.length; i++) {
                        var p = new mxPoint(value.points[i].x, value.points[i].y);
                        geometry.points.push(p);
                    }
                }
            }

            return geometry;

        } else if (type === 'mxGeometryChange') {
            var change = null;
            var geometry = null;
            if (value['mxGeometry'] !== undefined) {
                geometry = this.decode(value['mxGeometry'], 'mxGeometry');
            }
            var cell = this.lookup(value.cell);

            if (cell) {
                change = new mxGeometryChange(null, cell, geometry);
            }
            return change;

        } else if (type === 'mxStyleChange') {
            var change = null;
            var cell = this.lookup(value.cell);

            if (cell) {
                change = new mxStyleChange(null, cell, value['style']);
            }
            return change;

        } else if (type === 'mxValueChange') {
            var change = null;
            var cell = this.lookup(value.cell);

            if (cell) {
                change = new mxValueChange(null, cell, value['value']);
            }
            return change;

        } else if (type === 'mxTerminalChange') {
            var change = null;
            var terminal = this.lookup(value['terminal']);
            var source = value['source'];
            var cell = this.lookup(value.cell);

            if (cell && terminal) {
                change = new mxTerminalChange(null, cell, terminal, source);
            }
            return change;

        } else if (type === 'mxChildChange') {
            var change = null;

            // new cell
            if (value.previous === undefined) {
                var cell = this.decode(value['mxCell'], 'mxCell');
                var change = new mxChildChange(undefined, this.lookup(value.parent), cell, value.index);
                return change;

                // move index 
            } else {
                var cell = this.lookup(value.child);
                if (cell) {
                    change = new mxChildChange(undefined, this.lookup(value.parent), cell, value.index);
                }
                return change;
            }
        }
    }
}

function graphStart(container) {
    // Checks if the browser is supported
    if (!mxClient.isBrowserSupported()) {
        // Displays an error message if the browser is not supported.
        mxUtils.error('Browser is not supported!', 200, false);
    } else {
        mxGraphHandler.prototype.guidesEnabled = true;
        mxConstants.GUIDE_COLOR = '#FF0000';
        mxConstants.GUIDE_STROKEWIDTH = 1;
        mxEdgeHandler.prototype.snapToTerminals = true;

        mxEvent.disableContextMenu(container);
        graph = new mxGraph(container, model);
        graph.setPanning(true);
        new mxRubberband(graph);

        graph.setEnabled(permissions.write_access);

        // outline (minimap)
        var outline = new mxOutline(graph, document.getElementById('graphOutline'));

        // styles
        var style = graph.getStylesheet().getDefaultVertexStyle();
        style[mxConstants.STYLE_VERTICAL_LABEL_POSITION] = 'bottom';
        style[mxConstants.STYLE_VERTICAL_ALIGN] = 'top';
        style[mxConstants.STYLE_FONTSIZE] = '14';
        style[mxConstants.STYLE_FONTCOLOR] = '#fff';
        style[mxConstants.STYLE_FONTFAMILY] = 'lato';
        style[mxConstants.STYLE_STROKECOLOR] = '#000';
        style[mxConstants.STYLE_FILLCOLOR] = '#3f6ba3';

        var edgeStyle = {};
        style = graph.getStylesheet().getDefaultEdgeStyle();
        style[mxConstants.STYLE_VERTICAL_LABEL_POSITION] = 'bottom';
        style[mxConstants.STYLE_VERTICAL_ALIGN] = 'top';
        style[mxConstants.STYLE_FONTSIZE] = '14';
        style[mxConstants.STYLE_FONTCOLOR] = '#fff';
        style[mxConstants.STYLE_FONTFAMILY] = 'lato';
        style[mxConstants.STYLE_STROKECOLOR] = '#fff';

        // load shapes into registry
        var req = mxUtils.load('/images/icons/icons.xml');
        var root = req.getDocumentElement();
        var shape = root.firstChild;
        while (shape != null) {
            if (shape.nodeType == mxConstants.NODETYPE_ELEMENT) {
                mxStencilRegistry.addStencil(shape.getAttribute('name'), new mxStencil(shape));
            }
            shape = shape.nextSibling;
        }

        // keyboard listeners
        var keyHandler = new mxKeyHandler(graph);

        // delete key
        keyHandler.bindKey(46, function (evt) {
            if (graph.isEnabled()) {
                deleteConfirm('graphDeleteSelectedCell()');
            }
        });

        // ctrl+c key
        keyHandler.bindControlKey(67, function (evt) {
            if (graph.isEnabled() && mxEvent.isControlDown(evt)) {
                mxClipboard.copy(graph);
            }
        });

        // ctrl+c key
        keyHandler.bindControlKey(86, function (evt) {
            if (graph.isEnabled() && mxEvent.isControlDown(evt)) {
                mxClipboard.paste(graph);
            }
        });

        graph.addMouseListener({
            mouseDown: function (sender, evt) {},
            mouseMove: function (sender, evt) {},
            mouseUp: function (sender, evt) {
                if (graph.isEnabled()) {
                    if (evt.state !== undefined && evt.state.cell !== undefined) {
                        if (evt.evt.altKey) {
                            var name = evt.state.cell.id;
                            if (evt.state.cell.value !== '') {
                                name = evt.state.cell.value.split('\n')[0]
                            }
                            notesEdit(evt.state.cell.id, name);
                        }
                    }
                }
            }
        });

        // drag-over listener
        mxEvent.addListener(container, 'dragover', function (evt) {
            if (graph.isEnabled()) {
                evt.stopPropagation();
                evt.preventDefault();
            }
        });

        // file drop listener
        mxEvent.addListener(container, 'drop', function (evt) {
            if (graph.isEnabled()) {
                evt.stopPropagation();
                evt.preventDefault();

                var pt = mxUtils.convertPoint(graph.container, mxEvent.getClientX(evt), mxEvent.getClientY(evt));
                var tr = graph.view.translate;
                var scale = graph.view.scale;
                var x = pt.x / scale - tr.x;
                var y = pt.y / scale - tr.y;
                var value = '';

                // toolbar icon drop
                if (evt.dataTransfer.getData('text')) {
                    var icon = JSON.parse(evt.dataTransfer.getData('text'));

                    if (icon.value !== undefined) {
                        value = icon.value;
                    }

                    if (icon.type === 'stencil') {
                        var stencil = mxStencilRegistry.getStencil(icon.name);
                        if (stencil) {
                            graph.insertVertex(graph.getDefaultParent(), ObjectId(), value, x - (stencil.w0 / 2), y - (stencil.h0 / 2), stencil.w0, stencil.h0, icon.style);
                        }
                    } else if (icon.type === 'shape') {
                        graph.insertVertex(graph.getDefaultParent(), ObjectId(), value, x - (30 / 2), y - (30 / 2), 30, 30, icon.style);

                    } else if (icon.type === 'edge') {
                        graph.getModel().beginUpdate();
                        var edge = graph.insertEdge(graph.getDefaultParent(), ObjectId(), value, null, null, icon.style);
                        edge.geometry.setTerminalPoint(new mxPoint(x - 25, y + 25), true);
                        edge.geometry.setTerminalPoint(new mxPoint(x + 25, y - 25), false);
                        graph.getModel().endUpdate()
                    }

                // regular file drop
                } else if (evt.dataTransfer.files.length > 0) {
                    handleDrop(graph, evt.dataTransfer.files, x, y);

                // url drop
                } else if (evt.dataTransfer.getData('URL') != '' && evt.dataTransfer.getData('URL').indexOf('<svg') !== -1) {
                    handleSVGDrop(evt.dataTransfer.getData('URL'), x, y);
                }
            }
        });

        // changes listener
        model.addListener(mxEvent.CHANGE, function (sender, evt) {
            var codec = new JsonCodec();
            var changes = evt.getProperty('edit').changes;
            var nodes = [];
            var parsedChanges = [];
            var jsonChange = {};

            if (!graphReady) {
                return;
            }

            for (var i = 0; i < changes.length; i++) {
                if (changes[i].constructor == mxValueChange) {
                    var id = changes[i].cell.id;
                    var value = changes[i].value;

                    var objects = eventsTabulator.getColumn('dest_object').getCells();
                    objects = objects.concat(eventsTabulator.getColumn('source_object').getCells());
                    for (var j = 0; j < objects.length; j++) {
                        if (objects[j].getValue() === id) {
                            $(objects[j].getElement()).text(value);
                        }
                    }

                } else if (changes[i].constructor == mxChildChange && changes[i].index === undefined) {
                    // deleted node
                }
                if (!evt.getProperty('self-inflicted')) {
                    var node = codec.encode(changes[i]);
                    nodes.push(node);
                }
            }
            if (!evt.getProperty('self-inflicted')) {
                socket.send(JSON.stringify({
                    act: 'update_graph',
                    arg: nodes,
                    msgId: msgHandler()
                }));
            }

            // update the graphCellsSelect array
            graphCellsSelect = graphGetCellsByNameAndId();
        });

        // selection listener
        graph.getSelectionModel().addListener(mxEvent.CHANGE, function (sender, evt) {
            graphSelectionChanged(graph);
        });

        graph.isHtmlLabel = function(cell) {
            if (cell.style.indexOf('html=1;') !== -1) {
                return true;
            }
            return false;
        }

        mxGraphModel.prototype.createId = function(cell)
        {
            var id = ObjectId();
            
            return this.prefix + id + this.postfix;
        };
    }
};

function graphCopyCells(cells) {
    if (cells.length > 0) {
        var clones = graph.cloneCells(cells);

        // Checks for orphaned relative children and makes absolute
        for (var i = 0; i < clones.length; i++) {
            var state = graph.view.getState(cells[i]);

            if (state != null) {
                var geo = graph.getCellGeometry(clones[i]);

                if (geo != null && geo.relative) {
                    geo.relative = false;
                    geo.x = state.x / state.view.scale - state.view.translate.x;
                    geo.y = state.y / state.view.scale - state.view.translate.y;
                }
            }
        }

        textInput.value = mxClipboard.cellsToString(clones);
    }

    textInput.select();
    lastPaste = textInput.value;
};

function graphGetCurrentSelection() {
    return graph.getSelectionCell();
}

function graphCompareCellStyleToObject(cellStyle, styleObject) {
    var keys = Object.keys(styleObject);
    for (var i = 0; i < keys.length; i++) {
        if (styleObject[keys[i]] == cellStyle[keys[i]] || (styleObject[keys[i]] == 0 && cellStyle[keys[i]] == undefined)) {
            continue;
        } else {
            return false;
        }
    }
    return true;
}

function graphSetCellStyle(cell, styleElem, value) {
    if (!cell) {
        return;
    }
    var style = model.getStyle(cell);
    style = mxUtils.setStyle(style, styleElem, value);
    graph.setCellStyle(style, [cell]);
}

function graphSetCurrentCellStyle(value) {
    var cell = graph.getSelectionCell();
    if (!cell) {
        return;
    }
    model.setStyle(cell, style);
}

function graphSetCurrentCellValue(value) {
    var cell = graph.getSelectionCell();
    if (!cell) {
        return;
    }
    model.setValue(cell, value);
}

function graphSetCellStyleObject(cell, styleObject) {
    if (!cell) {
        return;
    }
    var style = model.getStyle(cell);
    var keys = Object.keys(styleObject);
    for (var i = 0; i < keys.length; i++) {
        if (styleObject[keys[i]] == '0') {
            style = mxUtils.setStyle(style, keys[i], '');
        } else {
            style = mxUtils.setStyle(style, keys[i], styleObject[keys[i]]);
        }
    }
    graph.setCellStyle(style, [cell]);
}

function graphMoveCellsFront() {
    var cell = graph.getSelectionCell();
    if (cell) {
        graph.orderCells(false, [cell]);
    }
}

function graphMoveCellsBack() {
    var cell = graph.getSelectionCell();
    if (cell) {
        graph.orderCells(true, [cell]);
    }
}

function handleSVGDrop(data, x, y) {
    var start = data.indexOf('<svg');
    var svgText = data.substring(start)
    var root = mxUtils.parseXml(svgText);

    // Parses SVG to find width and height
    if (root != null) {
        var svgs = root.getElementsByTagName('svg');
        if (svgs.length > 0) {
            var svgRoot = svgs[0];
            var w = parseFloat(svgRoot.getAttribute('width'));
            var h = parseFloat(svgRoot.getAttribute('height'));

            var vb = svgRoot.getAttribute('viewBox');

            if (vb == null || vb.length == 0) {
                svgRoot.setAttribute('viewBox', '0 0 ' + w + ' ' + h);
            } else if (isNaN(w) || isNaN(h)) {
                var tokens = vb.split(' ');

                if (tokens.length > 3) {
                    w = parseFloat(tokens[2]);
                    h = parseFloat(tokens[3]);
                }
            }

            w = Math.max(1, Math.round(w));
            h = Math.max(1, Math.round(h));

            data = 'data:image/svg+xml,' + btoa(mxUtils.getXml(svgs[0], '\n'));
            graph.insertVertex(graph.getDefaultParent(), ObjectId(), '', x, y, w, h, 'shape=image;image=' + data + ';');
        }
    }
}

function graphSelectionChanged(graph) {
    graph.container.focus();
    var cell = graph.getSelectionCell();
    toolbarUpdateSelection(cell);
}

function graphGetCellStyle(cell) {
    return graph.getCellStyle(cell);
}

function handleDrop(graph, files, x, y) {
    // image file
    for (var i = 0; i < files.length; i++) {
        if (files[i].type.substring(0, 5) == 'image') {
            var reader = new FileReader();
            var file = files[i];
            reader.onload = function (e) {
                var data = e.target.result;

                if (file.type.substring(0, 9) == 'image/svg') {
                    var comma = data.indexOf(',');
                    var svgText = atob(data.substring(comma + 1));
                    var root = mxUtils.parseXml(svgText);

                    if (root != null) {
                        var svgs = root.getElementsByTagName('svg');
                        if (svgs.length > 0) {
                            var svgRoot = svgs[0];
                            var w = parseFloat(svgRoot.getAttribute('width'));
                            var h = parseFloat(svgRoot.getAttribute('height'));

                            var vb = svgRoot.getAttribute('viewBox');

                            if (vb == null || vb.length == 0) {
                                svgRoot.setAttribute('viewBox', '0 0 ' + w + ' ' + h);
                            } else if (isNaN(w) || isNaN(h)) {
                                var tokens = vb.split(' ');

                                if (tokens.length > 3) {
                                    w = parseFloat(tokens[2]);
                                    h = parseFloat(tokens[3]);
                                }
                            }

                            w = Math.max(1, Math.round(w));
                            h = Math.max(1, Math.round(h));

                            data = 'data:image/svg+xml,' + btoa(mxUtils.getXml(svgs[0], '\n'));
                            graph.insertVertex(graph.getDefaultParent(), ObjectId(), '', x, y, w, h, 'shape=image;image=' + data + ';');
                        }
                    }
                } else {
                    var img = new Image();
                    img.onload = function () {
                        var w = Math.max(1, img.width);
                        var h = Math.max(1, img.height);
                        var semi = data.indexOf(';');

                        if (semi > 0) {
                            data = data.substring(0, semi) + data.substring(data.indexOf(',', semi + 1));
                        }
                        graph.insertVertex(graph.getDefaultParent(), ObjectId(), '', x, y, w, h, 'shape=image;image=' + data + ';');
                    };
                    img.src = data;
                }
            };
            reader.readAsDataURL(file);
        }
        // otherfile
        else {
            var formData = new FormData();
            formData.append('position', JSON.stringify({ x: x, y: y }));        
            formData.append('file', files[i]);        
            formData.append('mission_id', mission_id);
        
            $.ajax({
                url: 'upload',
                type: 'POST',
                data: formData,
                dataType: 'json',
                cache: false,
                contentType: false,
                processData: false,
                success: function () {
                },
                error: function () {
                    console.log('upload error');
                }
            });
        }
    }
};

function graphLoad(jsonGraph) {
    var jsonGraph = JSON.parse(jsonGraph);

    var codec = new JsonCodec();
    codec.lookup = function (id) {
        return model.getCell(id);
    }
    codec.decode(jsonGraph, 'mxGraphModel');
    graphReady = true;

    graphCellsSelect = graphGetCellsByNameAndId();

    /*
    for (var i = 0; i < graphCellsSelect.length; i++) {
        if (graphCellsSelect[i].name !== '') {
            notesAdd([{
                _id: graphCellsSelect[i]._id,
                name: escapeHtml(graphCellsSelect[i].name.split('\n')[0]),
                type: 'object'
            }]);
        }
    }
    */
}


function graphSearch(search) {
    graphSearchResults = [];
    graphSearchPtr = -1;
    if (search !== '') {
        var cells = graph.getChildCells(graph.getDefaultParent(), true, true);
        for (var i = 0; i < cells.length; i++) {
            if (cells[i].value !== undefined && cells[i].value.toLowerCase().indexOf(search.toLowerCase()) !== -1) {
                graphSearchResults.push(cells[i].id);
            }
        }
    }
    graphNextSearchResult();

}

function graphNextSearchResult() {
    graphRemoveHighlights();
    if (graphSearchResults.length > 0) {
        graphSearchPtr++;
        if (graphSearchPtr >= graphSearchResults.length || graphSearchPtr < 0)
            graphSearchPtr = 0;
        $('#graphSearchFoundCount').text(graphSearchPtr + 1 + '/' + graphSearchResults.length);
        $('#graphSearchFoundCount').show();

        var cell = model.getCell(graphSearchResults[graphSearchPtr]);
        if (cell) {
            graphHighlightCell(cell);
        }
    } else {
        $('#graphSearchFoundCount').hide();
    }
}

function graphPrevSearchResult() {
    graphRemoveHighlights();
    if (graphSearchResults.length > 0) {
        graphSearchPtr--;
        if (graphSearchPtr < 0)
            graphSearchPtr = graphSearchResults.length - 1;
        $('#graphSearchFoundCount').text(graphSearchPtr + 1 + '/' + graphSearchResults.length);
        var cell = model.getCell(graphSearchResults[graphSearchPtr]);
        if (cell) {
            graphHighlightCell(cell);
        }
    }
}

function graphHighlightCellById(id) {
    var cell = model.getCell(id);
    if (cell) {
        graphHighlightCell(cell);
    }
}

function graphHighlightCell(cell) {
    var highlight = new mxCellHighlight(graph, '#ff0000', 2, true);
    highlight.highlight(graph.view.getState(cell));
    graphHighlights.push(highlight);
}

function graphRemoveHighlights() {
    for (var i = 0; i < graphHighlights.length; i++) {
        graphHighlights[i].destroy();
    }
    graphHighlights = [];
}

function graphGetCellsByNameAndId() {
    var res = [{
        _id: '',
        name: ''
    }];
    var cells = graph.getChildCells(graph.getDefaultParent(), true, true);
    for (var i = 0; i < cells.length; i++) {
        if (cells[i].value.split('\n')[0] != '') {
            res.push({
                _id: [cells[i].id],
                name: cells[i].value.split('\n')[0]
            });
        }
    }
    return res;
}

function graphDeleteSelectedCell() {
    graph.removeCells();
}

function graphExecuteChanges(model, jsChanges) {
    for (var i = 0; i < jsChanges.length; i++) {
        var type = jsChanges[i].type;
        var codec = new JsonCodec();
        codec.lookup = function (id) {
            return model.getCell(id);
        }

        var changes = [];
        var change = codec.decode(jsChanges[i][type], type);

        change.model = model;
        change.execute();
        changes.push(change);

        var edit = new mxUndoableEdit(model, true);
        edit.changes = changes;

        edit.notify = function () {
            edit.source.fireEvent(new mxEventObject(mxEvent.CHANGE, 'edit', edit, 'changes', edit.changes));
            edit.source.fireEvent(new mxEventObject(mxEvent.NOTIFY, 'edit', edit, 'changes', edit.changes));
        }

        model.fireEvent(new mxEventObject(mxEvent.UNDO, 'edit', edit));
        model.fireEvent(new mxEventObject(mxEvent.CHANGE, 'edit', edit, 'changes', changes, 'self-inflicted', true));
    }
}

$(window).on('load', function () {
    graphStart(document.getElementById('canvas'));

    $('#graphSearchInput').on('input', function () {
        graphSearch(this.value)
    });

    $('#graphSearchNextButton').click(function () {
        graphNextSearchResult();
    });

    $('#graphSearchPrevButton').click(function () {
        graphPrevSearchResult();
    });

    $('#graphSearchClose').click(function () {
        graphSearch('');
        $('#graphFoundCount').hide();
        $('#graphSearchBar').hide();
        $('#graphSearchInput').val('');
    });

    // capture keys
    window.addEventListener("keydown", function (e) {
        // copy
        if ($.contains($('#canvas')[0], lastClick)) {
            if (e.keyCode === 114 || (e.ctrlKey && e.keyCode === 70)) {
                e.preventDefault();
                if (!$('#graphSearchBar').is(':visible')) {
                    $('#graphSearchBar').show().css('display', 'flex');
                    $('#graphSearch').focus();
                } else {
                    graphSearch('');
                    $('#graphFoundCount').hide();
                    $('#graphSearchBar').hide();
                    $('#graphSearchInput').val('');
                }
            }
        }
    })

    $('#zoomInButton').click(function () {
        graph.zoomIn();
    })

    $('#zoomOutButton').click(function () {
        graph.zoomOut();
    })
});