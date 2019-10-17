var graph;
var model = new mxGraphModel();

function startGraph(container)
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

        var style = {};
        style[mxConstants.STYLE_VERTICAL_LABEL_POSITION] = 'bottom';
        style[mxConstants.STYLE_VERTICAL_ALIGN] = 'top';
        style[mxConstants.STYLE_FONTSIZE] = '14';
        style[mxConstants.STYLE_FONTCOLOR] = '#fff';
        style[mxConstants.STYLE_FONTFAMILY] = 'Lato-Regular';
        style['fontWeight'] = 'regular';
        graph.getStylesheet().putDefaultVertexStyle(style);

        // drag-over listener
        mxEvent.addListener(container, 'dragover', function(evt)
        {
            
            if (graph.isEnabled())
            {
                console.log('over');
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

                if (evt.dataTransfer.files.length > 0) {
                    var filesArray = evt.dataTransfer.files;
                    for (var i = 0; i < filesArray.length; i++)
                    {
                        handleDrop(graph, filesArray[i], x + i * 10, y + i * 10);
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
                console.log(changes[i]);
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
    }
};

function handleSVGDrop(data,x,y) {
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
            graph.insertVertex(null, null, '', x, y, w, h, 'shape=image;image=' + data + ';');
        }
    }
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
                        graph.insertVertex(null, null, '', x, y, w, h, 'shape=image;image=' + data + ';');
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
                    graph.insertVertex(null, null, '', x, y, w, h, 'shape=image;image=' + data + ';');
                };                
                img.src = data;
            }
        };
        
        reader.readAsDataURL(file);
    }
};

function loadGraph(xml) {
    var xmlDoc = mxUtils.parseXml(xml);
    var node = xmlDoc.documentElement;
    var dec = new mxCodec(node.ownerDocument);
    dec.decode(node, graph.getModel());
}

function changes(model, n) {
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
    startGraph(document.getElementById('canvas'));
});
