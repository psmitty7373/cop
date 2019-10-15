var graph;
var model;
var g_model;

function main(container)
{
    // Checks if the browser is supported
    if (!mxClient.isBrowserSupported())
    {
        // Displays an error message if the browser is not supported.
        mxUtils.error('Browser is not supported!', 200, false);
    }
    else
    {
        // Disables the built-in context menu
        mxEvent.disableContextMenu(container);
        
        // Creates the graph inside the given container
        model = new mxGraphModel();
        g_model = new mxGraphModel();
        graph = new mxGraph(container, model);
        graph.setPanning(true);
        new mxRubberband(graph);

        model.addListener(mxEvent.CHANGE, function(sender, evt)
        {
            var codec = new mxCodec();
            var changes = evt.getProperty('edit').changes;
            var nodes = [];
            console.log(sender, evt, changes);
            for (var i = 0; i < changes.length; i++)
            {
                var node = codec.encode(changes[i]);
                var change = codec.decode(node);
                nodes.push(node);
                if (!evt.getProperty('self-inflicted')) {
                    socket.send(JSON.stringify({
                        act: 'echo',
                        arg: mxUtils.getXml(node),
                        msgId: msgHandler()
                    }));
                }
            }
        });

        g_model.addListener(mxEvent.CHANGE, function(sender, evt)
        {
            var codec = new mxCodec();
            var changes = evt.getProperty('edit').changes;
            var nodes = [];
            for (var i = 0; i < changes.length; i++)
            {
                var node = codec.encode(changes[i]);
                var change = codec.decode(node);
                nodes.push(node);
            }
        });
                        
        // Adds cells to the model in a single step

    }
};

function changes(n) {
    var codec = new mxCodec();

    codec.lookup = function(id)
    {
        return model.getCell(id);
    }

    n = mxUtils.parseXml(n).documentElement;

    var changes = [];
    var changes2 = [];
    var change = codec.decode(n);
    var change2 = codec.decode(n);
    console.log(change2);
    
    change.model = model;
    change2.model = g_model;

    change.execute();
    change2.execute();

    changes.push(change);
    changes2.push(change2);

    var edit = new mxUndoableEdit(model, true);
    var edit2 = new mxUndoableEdit(g_model, true);

    edit.changes = changes;
    edit2.changes = changes2;

    console.log(changes);
    
    edit.notify = function()
    {
      edit.source.fireEvent(new mxEventObject(mxEvent.CHANGE, 'edit', edit, 'changes', edit.changes));
      edit.source.fireEvent(new mxEventObject(mxEvent.NOTIFY, 'edit', edit, 'changes', edit.changes));
    }
    
    model.fireEvent(new mxEventObject(mxEvent.UNDO, 'edit', edit));
    model.fireEvent(new mxEventObject(mxEvent.CHANGE, 'edit', edit, 'changes', changes, 'self-inflicted', true));

    edit2.notify = function()
    {
      edit2.source.fireEvent(new mxEventObject(mxEvent.CHANGE, 'edit', edit2, 'changes', edit2.changes));
      edit2.source.fireEvent(new mxEventObject(mxEvent.NOTIFY, 'edit', edit2, 'changes', edit2.changes));
    }
    
    g_model.fireEvent(new mxEventObject(mxEvent.UNDO, 'edit', edit2));
    g_model.fireEvent(new mxEventObject(mxEvent.CHANGE, 'edit', edit2, 'changes', changes2, 'self-inflicted', true));
}

function doit() {
    var parent = graph.getDefaultParent();
    graph.getModel().beginUpdate();
    try
    {
        var v1 = graph.insertVertex(parent, null, 'Hello,', 20, 20, 80, 30);
        //var v2 = graph.insertVertex(parent, null, 'World!', 200, 150, 80, 30);
        //var e1 = graph.insertEdge(parent, null, '', v1, v2);
        //var g1 = graph.insertVertex(parent, null, '', 20, 20, 80, 80, 'shape=image;image=data:image/svg+xml,PD94bWwgdmVyc2lvbj0iMS4wIiBlbmNvZGluZz0iVVRGLTgiPz4KPHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHhtbG5zOnhsaW5rPSJodHRwOi8vd3d3LnczLm9yZy8xOTk5L3hsaW5rIiB3aWR0aD0iMjFwdCIgaGVpZ2h0PSIzNHB0IiB2aWV3Qm94PSIwIDAgMjEgMzQiIHZlcnNpb249IjEuMSI+CjxnIGlkPSJzdXJmYWNlMSI+CjxwYXRoIHN0eWxlPSIgc3Ryb2tlOm5vbmU7ZmlsbC1ydWxlOm5vbnplcm87ZmlsbDpyZ2IoMjQuNzA1ODgyJSw0MS45NjA3ODQlLDYzLjkyMTU2OSUpO2ZpbGwtb3BhY2l0eToxOyIgZD0iTSAxLjkxMDE1NiAzNCBMIDE5LjA4OTg0NCAzNCBDIDIwLjE0NDUzMSAzNCAyMSAzMy4xMzY3MTkgMjEgMzIuMDc0MjE5IEwgMjEgMjEuNTU0Njg4IEMgMjEgMjAuOTk2MDk0IDIwLjc1NzgxMiAyMC40ODA0NjkgMjAuMzU5Mzc1IDIwLjEyMTA5NCBMIDIwLjM1OTM3NSAxOS42NTYyNSBDIDIwLjc1NzgxMiAxOS4yOTY4NzUgMjEgMTguNzgxMjUgMjEgMTguMjIyNjU2IEwgMjEgMTQuODk0NTMxIEMgMjEgMTQuMzM1OTM4IDIwLjc1NzgxMiAxMy44MTY0MDYgMjAuMzU5Mzc1IDEzLjQ2MDkzOCBMIDIwLjM1OTM3NSAxMy4xNTIzNDQgQyAyMC43NTc4MTIgMTIuNzkyOTY5IDIxIDEyLjI3MzQzOCAyMSAxMS43MTg3NSBMIDIxIDguMzg2NzE5IEMgMjEgNy44MzIwMzEgMjAuNzU3ODEyIDcuMzEyNSAyMC4zNTkzNzUgNi45NTMxMjUgTCAyMC4zNTkzNzUgNi42NDQ1MzEgQyAyMC43NTc4MTIgNi4yODkwNjIgMjEgNS43Njk1MzEgMjEgNS4yMTA5MzggTCAyMSAxLjg4MjgxMiBDIDIxIDEuMDcwMzEyIDIwLjQ4ODI4MSAwLjM0Mzc1IDE5LjcyMjY1NiAwLjA3MDMxMjUgTCAxOS41NzAzMTIgMC4wMTU2MjUgTCAxOS40MDYyNSAwLjAxNTYyNSBMIDEuNjQ0NTMxIDAgTCAxLjUwNzgxMiAwIEwgMS4zNzUgMC4wMzkwNjI1IEMgMC41NjY0MDYgMC4yNzczNDQgMCAxLjAzNTE1NiAwIDEuODgyODEyIEwgMCA1LjIxMDkzOCBDIDAgNS43ODkwNjIgMC4yNjU2MjUgNi4zMjgxMjUgMC42ODc1IDYuNjg3NSBMIDAuNjg3NSA2LjkxNDA2MiBDIDAuMjY1NjI1IDcuMjczNDM4IDAgNy44MDg1OTQgMCA4LjM4NjcxOSBMIDAgMTEuNzE4NzUgQyAwIDEyLjI5Njg3NSAwLjI2NTYyNSAxMi44MzIwMzEgMC42ODc1IDEzLjE5MTQwNiBMIDAuNjg3NSAxMy40MTc5NjkgQyAwLjI2NTYyNSAxMy43NzczNDQgMCAxNC4zMTY0MDYgMCAxNC44OTQ1MzEgTCAwIDE4LjIyMjY1NiBDIDAgMTguODAwNzgxIDAuMjY1NjI1IDE5LjMzOTg0NCAwLjY4NzUgMTkuNjk1MzEyIEwgMC42ODc1IDIwLjA4MjAzMSBDIDAuMjY1NjI1IDIwLjQzNzUgMCAyMC45NzY1NjIgMCAyMS41NTQ2ODggTCAwIDMyLjA3NDIxOSBDIDAgMzMuMTM2NzE5IDAuODU1NDY5IDM0IDEuOTEwMTU2IDM0IFogTSAxLjkxMDE1NiAzNCAiLz4KPHBhdGggc3R5bGU9IiBzdHJva2U6bm9uZTtmaWxsLXJ1bGU6bm9uemVybztmaWxsOnJnYigxMDAlLDEwMCUsMTAwJSk7ZmlsbC1vcGFjaXR5OjAuNTAxOTYxOyIgZD0iTSAxNi4wMzEyNSAzLjQ5MjE4OCBDIDE2LjAzMTI1IDMuMDUwNzgxIDE1LjY3NTc4MSAyLjY5MTQwNiAxNS4yMzQzNzUgMi42OTE0MDYgQyAxNC43OTY4NzUgMi42OTE0MDYgMTQuNDQxNDA2IDMuMDQ2ODc1IDE0LjQzNzUgMy40OTIxODggQyAxNC40Mzc1IDMuOTM3NSAxNC43OTY4NzUgNC4yOTY4NzUgMTUuMjM0Mzc1IDQuMjk2ODc1IEMgMTUuNjcxODc1IDQuMjk2ODc1IDE2LjAzMTI1IDMuOTM3NSAxNi4wMzEyNSAzLjQ5MjE4OCBaIE0gMTYuMDMxMjUgMy40OTIxODggIi8+CjxwYXRoIHN0eWxlPSIgc3Ryb2tlOm5vbmU7ZmlsbC1ydWxlOm5vbnplcm87ZmlsbDpyZ2IoMTAwJSwxMDAlLDEwMCUpO2ZpbGwtb3BhY2l0eTowLjUwMTk2MTsiIGQ9Ik0gMTYuMDMxMjUgMTAuMDE5NTMxIEMgMTYuMDMxMjUgOS41NzQyMTkgMTUuNjc1NzgxIDkuMjE0ODQ0IDE1LjIzNDM3NSA5LjIxNDg0NCBDIDE0Ljc5Njg3NSA5LjIxNDg0NCAxNC40NDE0MDYgOS41NzQyMTkgMTQuNDM3NSAxMC4wMTk1MzEgQyAxNC40Mzc1IDEwLjQ2MDkzOCAxNC43OTY4NzUgMTAuODIwMzEyIDE1LjIzNDM3NSAxMC44MjAzMTIgQyAxNS42NzE4NzUgMTAuODIwMzEyIDE2LjAzMTI1IDEwLjQ2MDkzOCAxNi4wMzEyNSAxMC4wMTk1MzEgWiBNIDE2LjAzMTI1IDEwLjAxOTUzMSAiLz4KPHBhdGggc3R5bGU9IiBzdHJva2U6bm9uZTtmaWxsLXJ1bGU6bm9uemVybztmaWxsOnJnYigxMDAlLDEwMCUsMTAwJSk7ZmlsbC1vcGFjaXR5OjAuNTAxOTYxOyIgZD0iTSAxNi4wMzEyNSAxNi41NjI1IEMgMTYuMDMxMjUgMTYuMTIxMDk0IDE1LjY3NTc4MSAxNS43NjE3MTkgMTUuMjM0Mzc1IDE1Ljc2MTcxOSBDIDE0Ljc5Njg3NSAxNS43NjE3MTkgMTQuNDQxNDA2IDE2LjEyMTA5NCAxNC40Mzc1IDE2LjU2MjUgQyAxNC40Mzc1IDE3LjAwNzgxMiAxNC43OTY4NzUgMTcuMzY3MTg4IDE1LjIzNDM3NSAxNy4zNjcxODggQyAxNS42NzE4NzUgMTcuMzY3MTg4IDE2LjAzMTI1IDE3LjAwNzgxMiAxNi4wMzEyNSAxNi41NjI1IFogTSAxNi4wMzEyNSAxNi41NjI1ICIvPgo8cGF0aCBzdHlsZT0iIHN0cm9rZTpub25lO2ZpbGwtcnVsZTpub256ZXJvO2ZpbGw6cmdiKDEwMCUsMTAwJSwxMDAlKTtmaWxsLW9wYWNpdHk6MC4yNTA5ODsiIGQ9Ik0gMS42NDQ1MzEgNi4xNzE4NzUgTCAxOS40MDYyNSA2LjE3MTg3NSBMIDE5LjQwNjI1IDcuNDIxODc1IEwgMS42NDQ1MzEgNy40MjE4NzUgWiBNIDEuNjQ0NTMxIDYuMTcxODc1ICIvPgo8cGF0aCBzdHlsZT0iIHN0cm9rZTpub25lO2ZpbGwtcnVsZTpub256ZXJvO2ZpbGw6cmdiKDEwMCUsMTAwJSwxMDAlKTtmaWxsLW9wYWNpdHk6MC4yNTA5ODsiIGQ9Ik0gMS42NDQ1MzEgMTIuNjgzNTk0IEwgMTkuNDA2MjUgMTIuNjgzNTk0IEwgMTkuNDA2MjUgMTMuOTMzNTk0IEwgMS42NDQ1MzEgMTMuOTMzNTk0IFogTSAxLjY0NDUzMSAxMi42ODM1OTQgIi8+CjxwYXRoIHN0eWxlPSIgc3Ryb2tlOm5vbmU7ZmlsbC1ydWxlOm5vbnplcm87ZmlsbDpyZ2IoMTAwJSwxMDAlLDEwMCUpO2ZpbGwtb3BhY2l0eTowLjI1MDk4OyIgZD0iTSAxLjY0NDUzMSAxOS4yNTc4MTIgTCAxOS40MDYyNSAxOS4yNTc4MTIgTCAxOS40MDYyNSAyMC41MDc4MTIgTCAxLjY0NDUzMSAyMC41MDc4MTIgWiBNIDEuNjQ0NTMxIDE5LjI1NzgxMiAiLz4KPHBhdGggc3R5bGU9IiBzdHJva2U6bm9uZTtmaWxsLXJ1bGU6bm9uemVybztmaWxsOnJnYigxMDAlLDEwMCUsMTAwJSk7ZmlsbC1vcGFjaXR5OjAuODsiIGQ9Ik0gMTkuNDA2MjUgNy40ODQzNzUgTCAxOS40MDYyNSA3LjQyMTg3NSBMIDEuNjQ0NTMxIDcuNDIxODc1IEwgMS42NDQ1MzEgNy40Njg3NSBDIDEuMjQ2MDk0IDcuNTg1OTM4IDAuOTUzMTI1IDcuOTUzMTI1IDAuOTUzMTI1IDguMzg2NzE5IEwgMC45NTMxMjUgMTEuNzE0ODQ0IEMgMC45NTMxMjUgMTIuMTUyMzQ0IDEuMjUgMTIuNTE5NTMxIDEuNjQ0NTMxIDEyLjYzNjcxOSBMIDEuNjQ0NTMxIDEyLjY4MzU5NCBMIDE5LjQwNjI1IDEyLjY4MzU5NCBMIDE5LjQwNjI1IDEyLjYyMTA5NCBDIDE5Ljc3NzM0NCAxMi40ODgyODEgMjAuMDQ2ODc1IDEyLjEzNjcxOSAyMC4wNDY4NzUgMTEuNzE0ODQ0IEwgMjAuMDQ2ODc1IDguMzg2NzE5IEMgMjAuMDQ2ODc1IDcuOTY4NzUgMTkuNzc3MzQ0IDcuNjE3MTg4IDE5LjQwNjI1IDcuNDg0Mzc1IFogTSAxNS4yMzQzNzUgMTAuODIwMzEyIEMgMTQuNzk2ODc1IDEwLjgyMDMxMiAxNC40Mzc1IDEwLjQ2MDkzOCAxNC40Mzc1IDEwLjAxOTUzMSBDIDE0LjQzNzUgOS41NzQyMTkgMTQuNzk2ODc1IDkuMjE0ODQ0IDE1LjIzNDM3NSA5LjIxNDg0NCBDIDE1LjY3NTc4MSA5LjIxNDg0NCAxNi4wMzEyNSA5LjU3NDIxOSAxNi4wMzEyNSAxMC4wMTk1MzEgQyAxNi4wMzEyNSAxMC40NjA5MzggMTUuNjc1NzgxIDEwLjgyMDMxMiAxNS4yMzQzNzUgMTAuODIwMzEyIFogTSAxNy44ODY3MTkgMTAuODIwMzEyIEMgMTcuNDQ1MzEyIDEwLjgyMDMxMiAxNy4wODk4NDQgMTAuNDYwOTM4IDE3LjA4OTg0NCAxMC4wMTk1MzEgQyAxNy4wODk4NDQgOS41NzQyMTkgMTcuNDQ5MjE5IDkuMjE0ODQ0IDE3Ljg4NjcxOSA5LjIxNDg0NCBDIDE4LjMyNDIxOSA5LjIxNDg0NCAxOC42Nzk2ODggOS41NzQyMTkgMTguNjc5Njg4IDEwLjAxOTUzMSBDIDE4LjY3OTY4OCAxMC40NjA5MzggMTguMzI0MjE5IDEwLjgyMDMxMiAxNy44ODY3MTkgMTAuODIwMzEyIFogTSAxNy44ODY3MTkgMTAuODIwMzEyICIvPgo8cGF0aCBzdHlsZT0iIHN0cm9rZTpub25lO2ZpbGwtcnVsZTpub256ZXJvO2ZpbGw6cmdiKDEwMCUsMTAwJSwxMDAlKTtmaWxsLW9wYWNpdHk6MC44OyIgZD0iTSAxOS40MDYyNSAxMy45ODgyODEgTCAxOS40MDYyNSAxMy45MzM1OTQgTCAxLjY0NDUzMSAxMy45MzM1OTQgTCAxLjY0NDUzMSAxMy45NzI2NTYgQyAxLjI0NjA5NCAxNC4wODk4NDQgMC45NTMxMjUgMTQuNDU3MDMxIDAuOTUzMTI1IDE0Ljg5NDUzMSBMIDAuOTUzMTI1IDE4LjIyMjY1NiBDIDAuOTUzMTI1IDE4LjY2MDE1NiAxLjI1IDE5LjAyNzM0NCAxLjY0NDUzMSAxOS4xNDQ1MzEgTCAxLjY0NDUzMSAxOS4yNTc4MTIgTCAxOS40MDYyNSAxOS4yNTc4MTIgTCAxOS40MDYyNSAxOS4xMjg5MDYgQyAxOS43NzczNDQgMTguOTk2MDk0IDIwLjA0Njg3NSAxOC42NDA2MjUgMjAuMDQ2ODc1IDE4LjIyMjY1NiBMIDIwLjA0Njg3NSAxNC44OTQ1MzEgQyAyMC4wNDY4NzUgMTQuNDc2NTYyIDE5Ljc3NzM0NCAxNC4xMjEwOTQgMTkuNDA2MjUgMTMuOTg4MjgxIFogTSAxNS4yMzQzNzUgMTcuMzY3MTg4IEMgMTQuNzk2ODc1IDE3LjM2NzE4OCAxNC40Mzc1IDE3LjAwNzgxMiAxNC40Mzc1IDE2LjU2MjUgQyAxNC40Mzc1IDE2LjEyMTA5NCAxNC43OTY4NzUgMTUuNzYxNzE5IDE1LjIzNDM3NSAxNS43NjE3MTkgQyAxNS42NzU3ODEgMTUuNzYxNzE5IDE2LjAzMTI1IDE2LjEyMTA5NCAxNi4wMzEyNSAxNi41NjI1IEMgMTYuMDMxMjUgMTcuMDA3ODEyIDE1LjY3NTc4MSAxNy4zNjcxODggMTUuMjM0Mzc1IDE3LjM2NzE4OCBaIE0gMTcuODg2NzE5IDE3LjM2NzE4OCBDIDE3LjQ0NTMxMiAxNy4zNjcxODggMTcuMDg5ODQ0IDE3LjAwNzgxMiAxNy4wODk4NDQgMTYuNTYyNSBDIDE3LjA4OTg0NCAxNi4xMjEwOTQgMTcuNDQ5MjE5IDE1Ljc2MTcxOSAxNy44ODY3MTkgMTUuNzYxNzE5IEMgMTguMzI0MjE5IDE1Ljc2MTcxOSAxOC42Nzk2ODggMTYuMTIxMDk0IDE4LjY3OTY4OCAxNi41NjI1IEMgMTguNjc5Njg4IDE3LjAwNzgxMiAxOC4zMjQyMTkgMTcuMzY3MTg4IDE3Ljg4NjcxOSAxNy4zNjcxODggWiBNIDE3Ljg4NjcxOSAxNy4zNjcxODggIi8+CjxwYXRoIHN0eWxlPSIgc3Ryb2tlOm5vbmU7ZmlsbC1ydWxlOm5vbnplcm87ZmlsbDpyZ2IoMTAwJSwxMDAlLDEwMCUpO2ZpbGwtb3BhY2l0eTowLjg7IiBkPSJNIDE5LjQwNjI1IDAuOTc2NTYyIEwgMS42NDQ1MzEgMC45NjA5MzggQyAxLjI0NjA5NCAxLjA3ODEyNSAwLjk1MzEyNSAxLjQ0NTMxMiAwLjk1MzEyNSAxLjg4MjgxMiBMIDAuOTUzMTI1IDUuMjEwOTM4IEMgMC45NTMxMjUgNS42NDg0MzggMS4yNSA2LjAxNTYyNSAxLjY0NDUzMSA2LjEzMjgxMiBMIDEuNjQ0NTMxIDYuMTcxODc1IEwgMTkuNDA2MjUgNi4xNzE4NzUgTCAxOS40MDYyNSA2LjExNzE4OCBDIDE5Ljc3NzM0NCA1Ljk4NDM3NSAyMC4wNDY4NzUgNS42Mjg5MDYgMjAuMDQ2ODc1IDUuMjEwOTM4IEwgMjAuMDQ2ODc1IDEuODgyODEyIEMgMjAuMDQ2ODc1IDEuNDY0ODQ0IDE5Ljc3NzM0NCAxLjEwOTM3NSAxOS40MDYyNSAwLjk3NjU2MiBaIE0gMTUuMjM0Mzc1IDQuMjk2ODc1IEMgMTQuNzk2ODc1IDQuMjk2ODc1IDE0LjQzNzUgMy45Mzc1IDE0LjQzNzUgMy40OTIxODggQyAxNC40Mzc1IDMuMDUwNzgxIDE0Ljc5Njg3NSAyLjY5MTQwNiAxNS4yMzQzNzUgMi42OTE0MDYgQyAxNS42NzU3ODEgMi42OTE0MDYgMTYuMDMxMjUgMy4wNTA3ODEgMTYuMDMxMjUgMy40OTIxODggQyAxNi4wMzEyNSAzLjkzNzUgMTUuNjc1NzgxIDQuMjk2ODc1IDE1LjIzNDM3NSA0LjI5Njg3NSBaIE0gMTcuODg2NzE5IDQuMjk2ODc1IEMgMTcuNDQ1MzEyIDQuMjk2ODc1IDE3LjA4OTg0NCAzLjkzNzUgMTcuMDg5ODQ0IDMuNDkyMTg4IEMgMTcuMDg5ODQ0IDMuMDUwNzgxIDE3LjQ0OTIxOSAyLjY5MTQwNiAxNy44ODY3MTkgMi42OTE0MDYgQyAxOC4zMjQyMTkgMi42OTE0MDYgMTguNjc5Njg4IDMuMDUwNzgxIDE4LjY3OTY4OCAzLjQ5MjE4OCBDIDE4LjY3OTY4OCAzLjkzNzUgMTguMzI0MjE5IDQuMjk2ODc1IDE3Ljg4NjcxOSA0LjI5Njg3NSBaIE0gMTcuODg2NzE5IDQuMjk2ODc1ICIvPgo8cGF0aCBzdHlsZT0iIHN0cm9rZTpub25lO2ZpbGwtcnVsZTpub256ZXJvO2ZpbGw6cmdiKDEwMCUsMTAwJSwxMDAlKTtmaWxsLW9wYWNpdHk6MC44OyIgZD0iTSAxOS40MDYyNSAyMC42NDg0MzggTCAxOS40MDYyNSAyMC41MDc4MTIgTCAxLjY0NDUzMSAyMC41MDc4MTIgTCAxLjY0NDUzMSAyMC42MzI4MTIgQyAxLjI0NjA5NCAyMC43NSAwLjk1MzEyNSAyMS4xMTcxODggMC45NTMxMjUgMjEuNTU0Njg4IEwgMC45NTMxMjUgMzIuMDc0MjE5IEMgMC45NTMxMjUgMzIuNjAxNTYyIDEuMzgyODEyIDMzLjAzNTE1NiAxLjkxMDE1NiAzMy4wMzUxNTYgTCAxOS4wODk4NDQgMzMuMDM1MTU2IEMgMTkuNjE3MTg4IDMzLjAzNTE1NiAyMC4wNDY4NzUgMzIuNjAxNTYyIDIwLjA0Njg3NSAzMi4wNzQyMTkgTCAyMC4wNDY4NzUgMjEuNTU0Njg4IEMgMjAuMDQ2ODc1IDIxLjEzNjcxOSAxOS43NzczNDQgMjAuNzgxMjUgMTkuNDA2MjUgMjAuNjQ4NDM4IFogTSA0LjA2NjQwNiAzMC4yMDcwMzEgQyA0LjAxMTcxOSAzMC4yMDcwMzEgMy45NjA5MzggMzAuMTk1MzEyIDMuOTEwMTU2IDMwLjE2Nzk2OSBDIDMuNzU3ODEyIDMwLjA4MjAzMSAzLjcwMzEyNSAyOS44ODY3MTkgMy43ODkwNjIgMjkuNzMwNDY5IEwgNS45NzY1NjIgMjUuNzM0Mzc1IEMgNi4wNjI1IDI1LjU3ODEyNSA2LjI1NzgxMiAyNS41MjM0MzggNi40MTAxNTYgMjUuNjA5Mzc1IEMgNi41NjI1IDI1LjY5NTMxMiA2LjYyMTA5NCAyNS44OTA2MjUgNi41MzUxNTYgMjYuMDQ2ODc1IEwgNC4zNDM3NSAzMC4wNDI5NjkgQyA0LjI4NTE1NiAzMC4xNDg0MzggNC4xNzU3ODEgMzAuMjA3MDMxIDQuMDY2NDA2IDMwLjIwNzAzMSBaIE0gNi42NjAxNTYgMzAuMjA3MDMxIEMgNi42MDU0NjkgMzAuMjA3MDMxIDYuNTU0Njg4IDMwLjE5NTMxMiA2LjUwMzkwNiAzMC4xNjc5NjkgQyA2LjM1MTU2MiAzMC4wODIwMzEgNi4yOTY4NzUgMjkuODg2NzE5IDYuMzc4OTA2IDI5LjczMDQ2OSBMIDguNTcwMzEyIDI1LjczNDM3NSBDIDguNjU2MjUgMjUuNTc4MTI1IDguODUxNTYyIDI1LjUyMzQzOCA5LjAwMzkwNiAyNS42MDkzNzUgQyA5LjE1NjI1IDI1LjY5NTMxMiA5LjIxNDg0NCAyNS44OTA2MjUgOS4xMjg5MDYgMjYuMDQ2ODc1IEwgNi45Mzc1IDMwLjA0Mjk2OSBDIDYuODc4OTA2IDMwLjE0ODQzOCA2Ljc2OTUzMSAzMC4yMDcwMzEgNi42NjAxNTYgMzAuMjA3MDMxIFogTSA5LjI1MzkwNiAzMC4yMDcwMzEgQyA5LjE5OTIxOSAzMC4yMDcwMzEgOS4xNDg0MzggMzAuMTk1MzEyIDkuMDk3NjU2IDMwLjE2Nzk2OSBDIDguOTQ1MzEyIDMwLjA4MjAzMSA4Ljg5MDYyNSAyOS44ODY3MTkgOC45NzI2NTYgMjkuNzMwNDY5IEwgMTEuMTY0MDYyIDI1LjczNDM3NSBDIDExLjI1IDI1LjU3ODEyNSAxMS40NDUzMTIgMjUuNTIzNDM4IDExLjU5NzY1NiAyNS42MDkzNzUgQyAxMS43NSAyNS42OTUzMTIgMTEuODA0Njg4IDI1Ljg5MDYyNSAxMS43MjI2NTYgMjYuMDQ2ODc1IEwgOS41MzEyNSAzMC4wNDI5NjkgQyA5LjQ3MjY1NiAzMC4xNDg0MzggOS4zNjMyODEgMzAuMjA3MDMxIDkuMjUzOTA2IDMwLjIwNzAzMSBaIE0gMTEuODQ3NjU2IDMwLjIwNzAzMSBDIDExLjc5Mjk2OSAzMC4yMDcwMzEgMTEuNzQyMTg4IDMwLjE5NTMxMiAxMS42OTE0MDYgMzAuMTY3OTY5IEMgMTEuNTM5MDYyIDMwLjA4MjAzMSAxMS40ODQzNzUgMjkuODg2NzE5IDExLjU2NjQwNiAyOS43MzA0NjkgTCAxMy43NTc4MTIgMjUuNzM0Mzc1IEMgMTMuODQzNzUgMjUuNTc4MTI1IDE0LjAzOTA2MiAyNS41MjM0MzggMTQuMTkxNDA2IDI1LjYwOTM3NSBDIDE0LjM0Mzc1IDI1LjY5NTMxMiAxNC4zOTg0MzggMjUuODkwNjI1IDE0LjMxNjQwNiAyNi4wNDY4NzUgTCAxMi4xMjUgMzAuMDQyOTY5IEMgMTIuMDY2NDA2IDMwLjE0ODQzOCAxMS45NTcwMzEgMzAuMjA3MDMxIDExLjg0NzY1NiAzMC4yMDcwMzEgWiBNIDE2LjkwNjI1IDI2LjA0Njg3NSBMIDE0LjcxODc1IDMwLjA0Mjk2OSBDIDE0LjY2MDE1NiAzMC4xNDg0MzggMTQuNTUwNzgxIDMwLjIwNzAzMSAxNC40Mzc1IDMwLjIwNzAzMSBDIDE0LjM4NjcxOSAzMC4yMDcwMzEgMTQuMzM1OTM4IDMwLjE5NTMxMiAxNC4yODUxNTYgMzAuMTY3OTY5IEMgMTQuMTMyODEyIDMwLjA4MjAzMSAxNC4wNzgxMjUgMjkuODg2NzE5IDE0LjE2MDE1NiAyOS43MzA0NjkgTCAxNi4zNTE1NjIgMjUuNzM0Mzc1IEMgMTYuNDM3NSAyNS41ODIwMzEgMTYuNjMyODEyIDI1LjUyMzQzOCAxNi43ODUxNTYgMjUuNjA5Mzc1IEMgMTYuOTM3NSAyNS42OTUzMTIgMTYuOTkyMTg4IDI1Ljg5MDYyNSAxNi45MDYyNSAyNi4wNDY4NzUgWiBNIDE2LjkwNjI1IDI2LjA0Njg3NSAiLz4KPC9nPgo8L3N2Zz4K;');
    }
    finally
    {
        // Updates the display
        graph.getModel().endUpdate();
    }
}

function getit() {
    var encoder = new mxCodec();
    var result = encoder.encode(graph.getModel());
    var xml = mxUtils.getXml(result);
    console.log(xml);

    var encoder2 = new mxCodec();
    var result = encoder2.encode(g_graph.getModel());
    var xml = mxUtils.getXml(result);
    console.log(xml);
}

$(window).on('load', function () {
    main(document.getElementById('canvas'));
});

// ---------------------------- FABRIC CANVASES ----------------------------------
/*MAXWIDTH = 2000;
MAXHEIGHT = 2000;
fabric.Object.prototype.originX = 'left';
fabric.Object.prototype.originY = 'top';
//fabric.Group.prototype.hasControls = false;
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
    objectMoving(options.target, 2);
});

canvas.on('object:scaling', function (options) {
    var o = options.target;
    var tmod = 0;
    var lmod = 0;
    if (canvas.getActiveObjects().length > 1) {
        tmod = options.target.top + options.target.height / 2;
        lmod = options.target.left + options.target.width / 2;
    }
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
function objectMoving(o, snap) {
    var grid = 1;
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
    drawAlignmentGuides(o, snap);
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
}

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
                shape.set({
                    fill: o.fill_color,
                    stroke: o.stroke_color,
                    strokeWidth: 1,
                    scaleX: o.scale_x,
                    scaleY: o.scale_y,
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
}*/