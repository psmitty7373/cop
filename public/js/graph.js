var graph;
var model = new mxGraphModel();

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

        // outline (minimap)
        var outline = new mxOutline(graph, document.getElementById('graphOutline'));

        // styles
        var style = graph.getStylesheet().getDefaultVertexStyle();
        style[mxConstants.STYLE_VERTICAL_LABEL_POSITION] = 'bottom';
        style[mxConstants.STYLE_VERTICAL_ALIGN] = 'top';
        style[mxConstants.STYLE_FONTSIZE] = '14';
        style['fontColor'] = '#fff';
        style['fontFamily'] = 'Lato-Regular';
        style['strokeColor'] = '#000';
        style['fillColor'] = '#3f6ba3';        

        var edgeStyle = {};        
        style = graph.getStylesheet().getDefaultEdgeStyle();
        style['strokeColor'] = '#000000';
        style['fontColor'] = '#000000';
        style['fontStyle'] = '0';
        style['fontStyle'] = '0';
        style['startSize'] = '8';
        style['endSize'] = '8';

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

                if (evt.dataTransfer.getData('text')) {
                    /*
                    var e4 = graph.insertEdge(parent, null, '');
                    e4.geometry.setTerminalPoint(new mxPoint(1, 100), true); e4.geometry.setTerminalPoint(new mxPoint(100, 1), false);
                    */
                    
                    var icon = JSON.parse(evt.dataTransfer.getData('text'));
                    console.log(icon);
                    
                    if (icon.type === 'stencil') {
                        var stencil = mxStencilRegistry.getStencil(icon.name);
                        if (stencil) {
                            console.log(stencil);
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
            for (var i = 0; i < changes.length; i++)
            {
                var node = codec.encode(changes[i]);
                if (!evt.getProperty('self-inflicted')) {
                    socket.send(JSON.stringify({
                        act: 'update_graph',
                        arg: mxUtils.getXml(node),
                        msgId: msgHandler()
                    }));
                }
            }
        });

        // selection listener
        graph.getSelectionModel().addListener(mxEvent.CHANGE, function(sender, evt)
        {
            graphSelectionChanged(graph);
        });
    }
};

function graphGetCurrentSelection() {
    return graph.getSelectionCell();
}

function graphCellSetStyle(cell, styleElem, value) {
    if (!cell) {
        return;
    }
    var style = model.getStyle(cell);
    style = mxUtils.setStyle(style, styleElem, value);
    graph.setCellStyle(style, [cell]);
}

function graphCellSetStyleString(cell, styleStr) {
    if (!cell) {
        return;
    }
    var style = model.getStyle(cell);
    var elems = styleStr.split(';');
    for (var i = 0; i < elems.length; i++) {
        if (elems[i].indexOf('=') !== -1) {
            if (elems[i].split('=')[1] == '0') {
                console.log('removing style');
                style = mxUtils.setStyle(style, elems[i].split('=')[0], '');
            } else {
                style = mxUtils.setStyle(style, elems[i].split('=')[0], elems[i].split('=')[1]);
            }
        }
    }
    graph.setCellStyle(style, [cell]);
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
}

function graphExecuteChanges(model, n) {
    var codec = new mxCodec();
    codec.lookup = function(id)
    {
        return model.getCell(id);
    }

    n = mxUtils.parseXml(n);

    var changes = [];
    var change = codec.decode(n.documentElement);

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

$(window).on('load', function () {
    graphStart(document.getElementById('canvas'));

    $('#zoomInButton').click(function() {
        console.log('z');
        graph.zoomIn();
    })

    $('#zoomOutButton').click(function() {
        graph.zoomOut();
    })
});
