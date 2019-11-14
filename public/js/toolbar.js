// ---------------------------- Toolbar Stuff  ----------------------------------
var activeToolbar = null;
var activeTable = 'chat';
var toolbarState = false;

function toolbarToggle(toolbar) {
    if (toolbar === null) {
        toolbarToggle('tools');
        return;
    }

    if ($('#toolbarBody').width() === 0) {
        toolbarOpen(toolbar);
    } else {
        if (activeToolbar === toolbar)
            toolbarClose();
        else
            toolbarOpen(toolbar);
    }
}

function toolbarOpen(toolbar) {
    $('#toolbarButton').addClass('open');
    $('#' + activeToolbar + 'Tab').removeClass('activeTab');
    $('#' + toolbar + 'Tab').addClass('activeTab');

    if (!toolbarState) {
        $('#toolbarBody').animate({
            width: Math.max(10, Math.min($('#diagramJumbo').width() - 60, settings.toolbar))
        }, {
            duration: 100
        });
        toolbarState = true;
    }

    activeToolbar = toolbar;

    switch (toolbar) {
        case 'tools':
            $('#toolsForm').show();
            $('#notesForm').hide();
            $('#filesForm').hide();
            break;

        case 'notes':
            $('#toolsForm').hide();
            $('#notesForm').show();
            $('#filesForm').hide();
            break;

        case 'files':
            $('#toolsForm').hide();
            $('#notesForm').hide();
            $('#filesForm').show();
            break;
    }
}

function toolbarClose() {
    if (activeToolbar) {
        $('#' + activeToolbar + 'Tab').removeClass('activeTab');
    }
    $('#toolbarButton').removeClass('open');
    toolbarState = false;
    $('#toolbarBody').animate({
        width: "0px"
    }, 200);
}

// update the toolbox when a new icon is clicked
function toolbarUpdateSelection(cell) {
    if (cell) {
        var style = graphGetCellStyle(cell);

        $('#toolbarEditGroup').show();
        if (style) {
            $('#toolbarFillColor').val(style.fillColor);
            $('#toolbarFillColor').data('paletteColorPickerPlugin').reload();
            $('#toolbarStrokeColor').val(style.strokeColor);
            $('#toolbarStrokeColor').data('paletteColorPickerPlugin').reload();
            $('#toolbarFontColor').val(style.fontColor);
            $('#toolbarFontColor').data('paletteColorPickerPlugin').reload();
            $('#toolbarValue').val(cell.value);
            // disable textarea if cell is not editable
            if (cell.style.indexOf('editable=0;') !== -1) {
                $('#toolbarValue').prop('disabled', true);
            } else {
                $('#toolbarValue').prop('disabled', false);
            }
            if (cell.edge) {
                // set edge dash options dropdown
                var options = $('#toolbarEdgeDashOptions').find('img');
                for (var i = 0; i < options.length; i++) {
                    if ($(options[i]).attr('data-style') !== undefined) {
                        if (graphCompareCellStyleToObject(style, JSON.parse($(options[i]).attr('data-style')))) {
                            $($('#toolbarEdgeDashOptions').find('button')[0].firstChild).replaceWith($(options[i]).clone())
                        }
                    }
                }
                // set edge type dropdown
                options = $('#toolbarEdgeWaypointOptions').find('img');
                for (var i = 0; i < options.length; i++) {
                    if ($(options[i]).attr('data-style') !== undefined) {
                        if (graphCompareCellStyleToObject(style, JSON.parse($(options[i]).attr('data-style')))) {
                            $($('#toolbarEdgeWaypointOptions').find('button')[0].firstChild).replaceWith($(options[i]).clone())
                        }
                    }
                }
                $('#toolbarEdgeOptions').show();

            } else {
                $('#toolbarEdgeOptions').hide();
            }
        }
    } else {
        $('#toolbarEditGroup').hide();
    }
}

function cancelMenu() {
    $(window).off('contextmenu', cancelMenu);
    return false;
}

// bottom table toggle
function tableToggle(toolbar) {
    if (toolbar === activeTable) {
        return;
    }
    $('#' + activeTable).hide();
    $('#' + activeTable + 'Tab').removeClass('activeTab');
    $('#' + toolbar).show();
    $('#' + toolbar + 'Tab').addClass('activeTab');
    activeTable = toolbar;

    switch (toolbar) {
        case 'chat':
            break;

        case 'settings':
            settingsTabulator.redraw();
            break;

        case 'events':
            eventsTabulator.redraw();
            break;

        case 'opnotes':
            opnotesTabulator.redraw();
            break;
    }
}

function toolbarDropdownSetStyle(evt) {
    if (evt) {
        var selected = null;
        if (evt.clickEvent && $.contains(evt.target, evt.clickEvent.target)) {
            if ($(evt.clickEvent.target).is('img')) {
                selected = evt.clickEvent.target;
            } else {
                selected = evt.clickEvent.target.children[0];
            }
            var style = JSON.parse($(selected).attr('data-style'));
            
            var currentSelection = evt.relatedTarget.firstChild;
            if (selected && currentSelection) {
                $(currentSelection).replaceWith($(selected).clone());
            }

            if(style) {
                var cell = graphGetCurrentSelection();
                graphSetCellStyleObject(cell, style);
            }
        }
    }
}

// READY!
$(window).on('load', function () {
    // bind buttons
    if (permissions.write_access) {
        $('#toolbarFillColor').prop('disabled', false);
        $('#toolbarStrokeColor').prop('disabled', false);
        $('#toolbarFontColor').prop('disabled', false);
        $('#toolbarMoveToFront').prop('disabled', false).click(graphMoveCellsFront);
        $('#toolbarMoveToBack').prop('disabled', false).click(graphMoveCellsBack);
    }
    if (permissions.delete_access) {
        $('#toolbarDeleteObject').prop('disabled', false).click();;
    }

    $('#toolbarEditNotes').click(function () {
        var cell = graphGetCurrentSelection();
        if (cell) {
            var name = cell.id;
            if (cell.value !== '') {
                name = cell.value.split('\n')[0]
            }
            notesEdit(cell.id, cell.value.split('\n')[0]);
        }
    });

    $('#toolbarDeleteButton').click(function() {
        deleteConfirm('graphDeleteSelectedCell()');
    })
    
    // toolbar tabs
    $('#toolbarButton').click(function () {
        toolbarToggle(activeToolbar);
    });

    $('#toolsTab').click(function () {
        toolbarToggle('tools');
    });

    $('#notesTab').click(function () {
        toolbarToggle('notes');
    });

    $('#filesTab').click(function () {
        toolbarToggle('files');
    });

    $('#toolbarIcons').overlayScrollbars({
        className: "os-theme-light",
    });

    $('#toolbarValue').blur(function() {
        graphSetCurrentCellValue($('#toolbarValue').val());
    })

    $('[name="propFillColor"]').paletteColorPicker({
        colors: [
            {'#000000': '#000000'},
            {'#808080': '#808080'},
            {'#c0c0c0': '#c0c0c0'},
            {'#ffffff': '#ffffff'},
            {'#800000': '#800000'},
            {'#ff0000': '#ff0000'},
            {'#808000': '#808000'},
            {'#ffff00': '#ffff00'},
            {'#008000': '#008000'},
            {'#00ff00': '#00ff00'},
            {'#008080': '#008080'},
            {'#00ffff': '#00ffff'},
            {'#000080': '#000080'},
            {'#0000ff': '#0000ff'},
            {'#800080': '#800080'},
            {'#ff00ff': '#ff00ff'},
            {'#3f6ba3': '#3f6ba3'}
        ],
        clear_btn: null,
        position: 'upside',
        timeout: 2000,
        close_all_but_this: true,
        onchange_callback: function (color) {
            if (color !== $('#propFillColor').val()) {
                var cell = graphGetCurrentSelection();
                var style = graphGetCellStyle(cell);
                if (cell && style.fillColor !== color) {
                    graphSetCellStyle(cell, mxConstants.STYLE_FILLCOLOR, color);
                }  
            }
        }
    });

    $('[name="propStrokeColor"]').paletteColorPicker({
        colors: [
            {'#000000': '#000000'},
            {'#808080': '#808080'},
            {'#c0c0c0': '#c0c0c0'},
            {'#ffffff': '#ffffff'},
            {'#800000': '#800000'},
            {'#ff0000': '#ff0000'},
            {'#808000': '#808000'},
            {'#ffff00': '#ffff00'},
            {'#008000': '#008000'},
            {'#00ff00': '#00ff00'},
            {'#008080': '#008080'},
            {'#00ffff': '#00ffff'},
            {'#000080': '#000080'},
            {'#0000ff': '#0000ff'},
            {'#800080': '#800080'},
            {'#ff00ff': '#ff00ff'},
            {'#3f6ba3': '#3f6ba3'}  
        ],
        position: 'upside',
        timeout: 2000, // default -> 2000
        close_all_but_this: true,
        onchange_callback: function (color) {
            if (color !== $('#propStrokeColor').val()) {
                var cell = graphGetCurrentSelection();
                var style = graphGetCellStyle(cell);
                if (cell && style.strokeColor !== color) {
                    graphSetCellStyle(cell, mxConstants.STYLE_STROKECOLOR, color);
                }  
            }
        }
    });

    $('[name="propFontColor"]').paletteColorPicker({
        colors: [
            {'#000000': '#000000'},
            {'#808080': '#808080'},
            {'#c0c0c0': '#c0c0c0'},
            {'#ffffff': '#ffffff'},
            {'#800000': '#800000'},
            {'#ff0000': '#ff0000'},
            {'#808000': '#808000'},
            {'#ffff00': '#ffff00'},
            {'#008000': '#008000'},
            {'#00ff00': '#00ff00'},
            {'#008080': '#008080'},
            {'#00ffff': '#00ffff'},
            {'#000080': '#000080'},
            {'#0000ff': '#0000ff'},
            {'#800080': '#800080'},
            {'#ff00ff': '#ff00ff'},
            {'#3f6ba3': '#3f6ba3'}
        ],
        clear_btn: null,
        position: 'upside',
        timeout: 2000,
        close_all_but_this: true,
        onchange_callback: function (color) {
            if (color !== $('#propFontColor').val()) {
                var cell = graphGetCurrentSelection();
                var style = graphGetCellStyle(cell);
                if (cell && style.fontColor !== color) {
                    graphSetCellStyle(cell, mxConstants.STYLE_FONTCOLOR, color);
                }  
            }
        }
    });

    var iconHTML = '';
    for (var i = 0; i < icons.length; i++) {
        if (icons[i].type === 'divider') {
            iconHTML += '<div class="toolbarIconDivider">' + icons[i].name + '</div>';
        } else {
            iconHTML += '<div class="toolbarIconOuter"><div class="toolbarIconInner"><img src="/images/icons/' + icons[i].icon + '" class="toolbarIcon" data-data=' + JSON.stringify(icons[i]) + '></div></div>';
        }
    }
    $('#toolbarIconsHeader').after(iconHTML);

    $('.toolbarIcon').on('dragstart', function(evt) {
        if ($(evt.target).attr('data-data')) {
            evt.originalEvent.dataTransfer.setData('text/plain', $(evt.target).attr('data-data'));
        }
    });

    $('#toolbarEdgeDashOptions').on('hide.bs.dropdown', toolbarDropdownSetStyle);

    $('#toolbarEdgeWaypointOptions').on('hide.bs.dropdown', toolbarDropdownSetStyle);
});