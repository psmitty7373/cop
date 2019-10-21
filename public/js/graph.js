var graph;
var model = new mxGraphModel();
var graphSearchResults = [];
var graphSearchPtr = null;
var graphHighlights = [];
var graphCellsSelect = [{ _id: '', name: '' }];

function graphStart(container)
{
    // Checks if the browser is supported
    if (!mxClient.isBrowserSupported())
    {
        // Displays an error message if the browser is not supported.
        mxUtils.error('Browser is not supported!', 200, false);
    }
    else
    {
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
        while (shape != null)
        {
            if (shape.nodeType == mxConstants.NODETYPE_ELEMENT)
            {
                mxStencilRegistry.addStencil(shape.getAttribute('name'), new mxStencil(shape));
            }            
            shape = shape.nextSibling;
        }

        // keyboard listeners
        var keyHandler = new mxKeyHandler(graph);

        // delete key
        keyHandler.bindKey(46, function(evt)
        {
            if (graph.isEnabled())
            {
                graph.removeCells();
            }
        });

        // ctrl+c key
        keyHandler.bindControlKey(67, function(evt)
        {
            if (graph.isEnabled() && mxEvent.isControlDown(evt))
            {
                mxClipboard.copy(graph);
            }
        });

        // ctrl+c key
        keyHandler.bindControlKey(86, function(evt)
        {
            if (graph.isEnabled() && mxEvent.isControlDown(evt))
            {
                mxClipboard.paste(graph);
            }
        });

        // drag-over listener
        mxEvent.addListener(container, 'dragover', function(evt)
        {
            if (graph.isEnabled())
            {
                evt.stopPropagation();
                evt.preventDefault();
            }
        });

        // file drop listener
        mxEvent.addListener(container, 'drop', function(evt)
        {
            if (graph.isEnabled())
            {
                evt.stopPropagation();
                evt.preventDefault();

                var pt = mxUtils.convertPoint(graph.container, mxEvent.getClientX(evt), mxEvent.getClientY(evt));
                var tr = graph.view.translate;
                var scale = graph.view.scale;
                var x = pt.x / scale - tr.x;
                var y = pt.y / scale - tr.y;
                var w = 0;
                var h = 0;

                if (evt.dataTransfer.getData('text')) {
                    var icon = JSON.parse(evt.dataTransfer.getData('text'));
                    
                    if (icon.type === 'stencil') {
                        var stencil = mxStencilRegistry.getStencil(icon.name);
                        if (stencil) {
                            graph.insertVertex(null, ObjectId(), '', x - (stencil.w0/2), y - (stencil.h0/2), stencil.w0, stencil.h0, icon.style);
                        }
                    } else if (icon.type === 'edge') {
                        graph.getModel().beginUpdate();
                        var edge = graph.insertEdge(null,  ObjectId(), '', null, null, icon.style);
                        edge.geometry.setTerminalPoint(new mxPoint(x - 25, y + 25), true);
                        edge.geometry.setTerminalPoint(new mxPoint(x + 25,  y - 25), false);
                        graph.getModel().endUpdate()
                    }
                    
                } else if (evt.dataTransfer.files.length > 0) {
                    var filesArray = evt.dataTransfer.files;
                    for (var i = 0; i < filesArray.length; i++)
                    {
                        handleDrop(graph, filesArray[i], (x - (w / 2)) + i * 10, (y - (h / 2)) + i * 10);
                    }
                } else if (evt.dataTransfer.getData('URL') != '' && evt.dataTransfer.getData('URL').indexOf('<svg') !== -1) {
                    handleSVGDrop(evt.dataTransfer.getData('URL'), x, y);
                }
            }
        });

        // changes listener
        model.addListener(mxEvent.CHANGE, function(sender, evt)
        {
            var codec = new mxCodec();
            var changes = evt.getProperty('edit').changes;
            var nodes = [];
            for (var i = 0; i < changes.length; i++)
            {
                
                if (changes[i].constructor == mxValueChange) {
                    var id = changes[i].cell.id;
                    var value = changes[i].value;
                    var node = $('#notes').jstree(true).get_node(id, true);
                    if (node) {
                        if (value !== '') {
                            $('#notes').jstree().rename_node(id, escapeHtml(value.split('\n')[0]));
                        } else {
                            $('#notes').jstree(true).delete_node(node);
                        }
                    } else if (value !== '') {
                        notesAdd([{ _id: id, name: escapeHtml(value.split('\n')[0]), type: 'object' }]);
                    }
                } else if (changes[i].constructor == mxChildChange && changes[i].index === undefined) {
                    var id = changes[i].child.id;

                    var node = $('#notes').jstree(true).get_node(id, true);
                    if (node) {
                        $('#notes').jstree(true).delete_node(node);
                    }
                }

                var node = codec.encode(changes[i]);
                nodes.push(mxUtils.getXml(node));
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
        graph.getSelectionModel().addListener(mxEvent.CHANGE, function(sender, evt)
        {
            graphSelectionChanged(graph);
        });
    }
};

function graphCopyCells(cells)
{
    if (cells.length > 0)
    {
        var clones = graph.cloneCells(cells);
        
        // Checks for orphaned relative children and makes absolute
        for (var i = 0; i < clones.length; i++)
        {
            var state = graph.view.getState(cells[i]);
            
            if (state != null)
            {
                var geo = graph.getCellGeometry(clones[i]);
                
                if (geo != null && geo.relative)
                {
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
    if (root != null)
    {
        var svgs = root.getElementsByTagName('svg');     
        if (svgs.length > 0)
        {
            var svgRoot = svgs[0];
            var w = parseFloat(svgRoot.getAttribute('width'));
            var h = parseFloat(svgRoot.getAttribute('height'));

            var vb = svgRoot.getAttribute('viewBox');
            
            if (vb == null || vb.length == 0)
            {
                svgRoot.setAttribute('viewBox', '0 0 ' + w + ' ' + h);
            }
            else if (isNaN(w) || isNaN(h))
            {
                var tokens = vb.split(' ');
                
                if (tokens.length > 3)
                {
                    w = parseFloat(tokens[2]);
                    h = parseFloat(tokens[3]);
                }
            }
            
            w = Math.max(1, Math.round(w));
            h = Math.max(1, Math.round(h));
            
            data = 'data:image/svg+xml,' + btoa(mxUtils.getXml(svgs[0], '\n'));
            graph.insertVertex(null, ObjectId(), '', x, y, w, h, 'shape=image;image=' + data + ';');
        }
    }
}

function graphSelectionChanged(graph)
{
    graph.container.focus();
    var cell = graph.getSelectionCell();
    toolbarUpdateSelection(cell);
    if (cell) {
    } else {
    }
}

function graphGetCellStyle(cell) {
    return graph.getCellStyle(cell);
}

function handleDrop(graph, file, x, y)
{
    console.log('drop');
    if (file.type.substring(0, 5) == 'image')
    {
        var reader = new FileReader();
        reader.onload = function(e)
        {
            var data = e.target.result;

            if (file.type.substring(0, 9) == 'image/svg')
            {
                var comma = data.indexOf(',');
                var svgText = atob(data.substring(comma + 1));
                var root = mxUtils.parseXml(svgText);

                if (root != null)
                {
                    var svgs = root.getElementsByTagName('svg');                    
                    if (svgs.length > 0)
                    {
                        var svgRoot = svgs[0];
                        var w = parseFloat(svgRoot.getAttribute('width'));
                        var h = parseFloat(svgRoot.getAttribute('height'));
                        
                        var vb = svgRoot.getAttribute('viewBox');
                        
                        if (vb == null || vb.length == 0)
                        {
                            svgRoot.setAttribute('viewBox', '0 0 ' + w + ' ' + h);
                        }
                        else if (isNaN(w) || isNaN(h))
                        {
                            var tokens = vb.split(' ');
                            
                            if (tokens.length > 3)
                            {
                                w = parseFloat(tokens[2]);
                                h = parseFloat(tokens[3]);
                            }
                        }
                        
                        w = Math.max(1, Math.round(w));
                        h = Math.max(1, Math.round(h));
                        
                        data = 'data:image/svg+xml,' + btoa(mxUtils.getXml(svgs[0], '\n'));
                        graph.insertVertex(null, ObjectId(), '', x, y, w, h, 'shape=image;image=' + data + ';');
                    }
                }
            }
            else
            {
                var img = new Image();                
                img.onload = function()
                {
                    var w = Math.max(1, img.width);
                    var h = Math.max(1, img.height);                    
                    var semi = data.indexOf(';');
                    
                    if (semi > 0)
                    {
                        data = data.substring(0, semi) + data.substring(data.indexOf(',', semi + 1));
                    }
                    graph.insertVertex(null, ObjectId(), '', x, y, w, h, 'shape=image;image=' + data + ';');
                };                
                img.src = data;
            }
        };
        
        reader.readAsDataURL(file);
    }
};

function graphLoad(xml) {
    var xmlDoc = mxUtils.parseXml(xml);
    var node = xmlDoc.documentElement;
    var dec = new mxCodec(node.ownerDocument);
    dec.decode(node, graph.getModel());

    graphCellsSelect = graphGetCellsByNameAndId();

    for (var i = 0; i < graphCellsSelect.length; i++) {
        if (graphCellsSelect[i].name !== '') {
            notesAdd([{ _id: graphCellsSelect[i]._id, name: escapeHtml(graphCellsSelect[i].name.split('\n')[0]), type: 'object' }]);
        }
    }
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
        graphSearchPtr ++;
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
        graphSearchPtr --;
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
    var res = [{ _id: '', name: '' }];
    var cells = graph.getChildCells(graph.getDefaultParent(), true, true);
    for (var i = 0; i < cells.length; i++) {
        if (cells[i].value.split('\n')[0] != '') {
            res.push({ _id: [cells[i].id], name: cells[i].value.split('\n')[0]});
        }
    }
    return res;
}

function graphDeleteSelectedCell() {
    graph.removeCells();
}

function graphExecuteChanges(model, n) {
    for (var i = 0; i < n.length; i++) {
        var codec = new mxCodec();
        codec.lookup = function(id)
        {
            return model.getCell(id);
        }

        var c = mxUtils.parseXml(n[i]);

        var changes = [];
        var change = codec.decode(c.documentElement);

        change.model = model;
        change.execute();
        changes.push(change);

        var edit = new mxUndoableEdit(model, true);
        edit.changes = changes;

        edit.notify = function()
        {
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

    $('#zoomInButton').click(function() {
        console.log('z');
        graph.zoomIn();
    })

    $('#zoomOutButton').click(function() {
        graph.zoomOut();
    })
});
