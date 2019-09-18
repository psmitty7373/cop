(function ($) {
    "use strict";

    var namespace = 'bsw';
    Window = function (options) {
        options = options || {};
        var defaults = {
            selectors: {
                handle: '.window-header',
                title: '.window-title',
                body: '.window-body',
                footer: '.window-footer'
            },
            elements: {
                handle: null,
                title: null,
                body: null,
                footer: null
            },
            references: {
                body: $('body'),
                window: $(window)
            },
            effect: 'fade',
            parseHandleForTitle: true,
            maximized: false,
            maximizable: false,
            title: 'No Title',
            bodyContent: '',
            footerContent: '',
            closeCallback: null
        };
        this.options = $.extend(true, {}, defaults, options);
        this.initialize(this.options);
        return this;
    };

    Window.prototype.initialize = function (options) {
        var _this = this;

        if (options.fromElement) {
            if (options.fromElement instanceof jQuery) {
                this.$el = options.clone ? options.fromElement.clone() : options.fromElement;
            } else if (options.fromElement instanceof Element) {
                this.$el = options.clone ? $(options.fromElement).clone() : $(options.fromElement);
            } else if (typeof options.fromElement) {
                this.$el = options.clone ? $(options.fromElement).clone() : $(options.fromElement);
            }
        } else if (options.template) {
            this.$el = $(options.template);
        } else {
            throw new Error("No template specified for window.");
        }

        if (this.$el.find(options.selectors.handle).length <= 0) {
            this.$el.prepend('<div class="window-header"><h4 class="window-title"></h4></div>');
        }

        if (options.elements.zIndex) this.$el.css('zIndex', options.elements.zIndex);else this.$el.css('zIndex', 900);

        options.elements.handle = this.$el.find(options.selectors.handle);
        options.elements.title = this.$el.find(options.selectors.title);
        options.elements.body = this.$el.find(options.selectors.body);
        options.elements.footer = this.$el.find(options.selectors.footer);
        options.elements.title.html(options.title);

        if (options.maximizable) {
            options.elements.buttons = {};
            options.elements.buttons.maximize = $('<button data-maximize="window"><i class="glyphicon glyphicon-chevron-up"></i></button>');
            options.elements.handle.prepend(options.elements.buttons.maximize);
            options.elements.buttons.restore = $('<button data-restore="window"><i class="glyphicon glyphicon-modal-window"></i></button>');
            options.elements.handle.prepend(options.elements.buttons.restore);
        }
        if (_this.$el.find('[data-dismiss=window]').length <= 0) {
            //button.close(type='button' data-dismiss='modal')#modal-close &times;
            options.elements.handle.append('<button type="button" class="close" data-dismiss="window" aria-hidden="false">&times;</button>');
        }
        options.elements.body.html(options.bodyContent);
        //options.elements.footer.html(options.footerContent);

        this.undock();

        this.setSticky(options.sticky);
    };

    Window.prototype.undock = function () {
        var _this = this;
        this.$el.css('visibility', 'hidden');
        this.$el.appendTo('body');
        this.centerWindow();
        if (/Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent)) {
            this.options.references.window.bind('orientationchange resize', function (event) {
                _this.centerWindow();
            });
        }

        this.$el.on('touchmove', function (e) {
            e.stopPropagation();
        });

        this.initHandlers();
        this.$el.hide();
        if (this.options.id) {
            this.id = this.options.id;
        } else {
            this.id = '';
        }
        this.show();
    };

    Window.prototype.maximize = function () {
        this.$el.removeClass('minimized');
        this.$el.addClass('maximized');
        this.state = "maximized";
        var bottomOffset = 0;
        if (this.options.window_manager) {
            bottomOffset = this.options.window_manager.getContainer().height();
        }
        this.$el.css({
            top: parseInt($('body').css('paddingTop'), 10),
            left: 0,
            right: 0,
            bottom: bottomOffset,
            maxWidth: 'none',
            width: 'auto',
            height: 'auto'
        });
        this.$el.trigger(namespace + '.maximize');
    };

    Window.prototype.restore = function () {
        this.$el.removeClass('minimized');
        this.$el.removeClass('maximized');
        this.$el.removeAttr('style');
        this.state = undefined;
        this.$el.css({
            top: this.window_info.top,
            left: this.window_info.left,
            width: this.window_info.width,
            height: this.window_info.height
        });
        this.$el.removeProp('style');
        this.$el.trigger(namespace + '.restore');
    };

    Window.prototype.show = function (cb) {
        var _this = this;
        this.$el.css('visibility', 'visible');
        var callbackHandler = function () {
            _this.$el.trigger(namespace + '.show');
            if (cb) {
                cb.call(_this, arguments);
            }
        };
        if (this.options.effect === 'fade') {
            this.$el.fadeIn(undefined, undefined, callbackHandler);
        } else {
            this.$el.show();
            callbackHandler.call(this.$el);
        }
    };

    Window.prototype.setEffect = function (effect) {
        this.options.effect = effect;
    };

    Window.prototype.getEffect = function () {
        return this.options.effect;
    };

    Window.prototype.centerWindow = function () {
        var top,
            left,
            bodyTop = parseInt(this.options.references.body.position().top, 10) + parseInt(this.options.references.body.css('paddingTop'), 10),
            maxHeight;
        left = this.options.references.window.width() / 2 - this.$el.width() / 2;
        top = window.innerHeight / 2 - this.$el.height() / 2;

        if (top < bodyTop) {
            top = bodyTop;
        }

        maxHeight = window.innerHeight - bodyTop - (parseInt(this.options.elements.handle.css('height'), 10) + parseInt(this.options.elements.footer.css('height'), 10)) - 45;
        this.options.elements.body.css('maxHeight', maxHeight);

        this.$el.css('left', left);
        this.$el.css('top', top);
        if (this.$el && this.$el.length > 0) {
            this.window_info = {
                top: this.$el.position().top,
                left: this.$el.position().left,
                width: this.$el.outerWidth(),
                height: this.$el.outerHeight()
            };
        }
        this.$el.trigger(namespace + '.centerWindow');
    };

    Window.prototype.close = function (cb) {
        var _this = this;
        if (this.options.parent) {
            this.options.parent.clearBlocker();
            if (this.options.window_manager) {
                this.options.window_manager.setFocused(this.options.parent);
            }
        } else if (this.options.window_manager && this.options.window_manager.windows.length > 0) {
            this.options.window_manager.setNextFocused();
        }

        var closeFn = function () {
            _this.$el.trigger(namespace + '.close');
            _this.$el.remove();
            if (_this.options.closeCallback) {
                _this.options.closeCallback();
            }
            if (cb) {
                cb.call(_this);
            }
        };

        if (this.options.effect === 'fade') {
            this.$el.fadeOut(closeFn);
        } else {
            closeFn.call(_this.$el);
        }

        if (this.$windowTab) {
            if (this.options.effect === 'fade') {
                this.$windowTab.fadeOut(400, function () {
                    _this.$windowTab.remove();
                });
            } else {
                this.$windowTab.hide();
                this.$windowTab.remove();
            }
        }
    };

    Window.prototype.on = function () {
        this.$el.on.apply(this.$el, arguments);
    };

    Window.prototype.sendToBack = function () {
        var returnVal = false;
        if (this.options.window_manager) {
            returnVal = this.options.window_manager.sendToBack(this);
        }
        return returnVal;
    };

    Window.prototype.setActive = function (active) {
        if (active) {
            this.$el.addClass('active');
            if (this.$windowTab) {
                this.$windowTab.addClass('label-primary');
            }
            this.$el.trigger('active');
        } else {
            this.$el.removeClass('active');
            if (this.$windowTab) {
                this.$windowTab.removeClass('label-primary');
                this.$windowTab.addClass('label-default');
            }
            this.$el.trigger('inactive');
        }
    };

    Window.prototype.setIndex = function (index) {
        this.$el.css('zIndex', index);
    };

    Window.prototype.setWindowTab = function (windowTab) {
        this.$windowTab = windowTab;
    };
    Window.prototype.getWindowTab = function () {
        return this.$windowTab;
    };

    Window.prototype.getTitle = function () {
        return this.options.title;
    };

    Window.prototype.getElement = function () {
        return this.$el;
    };

    Window.prototype.setSticky = function (sticky) {
        this.options.sticky = sticky;
        if (sticky === false) {
            this.$el.css({
                'position': 'absolute'
            });
        } else {
            this.$el.css({
                'position': 'fixed'
            });
        }
    };

    Window.prototype.getSticky = function () {
        return this.options.sticky;
    };

    Window.prototype.setManager = function (window_manager) {
        this.options.window_manager = window_manager;
    };

    Window.prototype.initHandlers = function () {
        var _this = this;
        var title_buttons;

        this.$el.find('[data-dismiss=window]').on('click', function (event) {
            event.stopPropagation();
            event.preventDefault();
            if (_this.options.blocker) {
                return;
            }
            _this.close();
        });

        this.$el.find('[data-maximize=window]').on('click', function (event) {
            event.stopPropagation();
            event.preventDefault();
            if (_this.options.blocker) {
                return;
            }
            _this.maximize();
        });

        this.$el.find('[data-restore=window]').on('click', function (event) {
            if (_this.options.blocker) {
                return;
            }
            _this.restore();
        });

        this.$el.off('mousedown');
        this.$el.on('mousedown', function () {
            if (_this.options.blocker) {
                _this.options.blocker.getElement().trigger('focused');
                _this.options.blocker.blink();
                return;
            } else {
                _this.$el.trigger('focused');
            }

            if (_this.$el.hasClass('ns-resize') || _this.$el.hasClass('ew-resize')) {
                $('body > *').addClass('disable-select');
                _this.resizing = true;
                _this.offset = {};
                _this.offset.x = event.pageX;
                _this.offset.y = event.pageY;
                _this.window_info = {
                    top: _this.$el.position().top,
                    left: _this.$el.position().left,
                    width: _this.$el.outerWidth(),
                    height: _this.$el.outerHeight()
                };

                if (event.offsetY < 5) {
                    _this.$el.addClass('north');
                }
                if (event.offsetY > _this.$el.height() - 5) {
                    _this.$el.addClass('south');
                }
                if (event.offsetX < 5) {
                    _this.$el.addClass('west');
                }
                if (event.offsetX > _this.$el.width() - 5) {
                    _this.$el.addClass('east');
                }
            }
        });

        _this.options.references.body.on('mouseup', function () {
            _this.resizing = false;
            $('body > *').removeClass('disable-select');
            _this.$el.removeClass('west');
            _this.$el.removeClass('east');
            _this.$el.removeClass('north');
            _this.$el.removeClass('south');
        });
        _this.options.elements.handle.off('mousedown');
        _this.options.elements.handle.on('mousedown', function (event) {
            if (_this.options.blocker) {
                return;
            }
            //           _this.moving = true;
            //         _this.offset = {};
            //       _this.offset.x = event.pageX - _this.$el.position().left;
            //     _this.offset.y = event.pageY - _this.$el.position().top;
            $('body > *').addClass('disable-select');
        });
        _this.options.elements.handle.on('mouseup', function (event) {
            //   _this.moving = false;
            $('body > *').removeClass('disable-select');
        });

        _this.options.references.body.on('mousemove', _this.$el, function (event) {
            if (_this.moving && _this.state !== "maximized" && ($(event.toElement).hasClass(_this.options.selectors.handle.replace('.', '')) || $(event.toElement).hasClass(_this.options.selectors.title.replace('.', '')))) {

                var top = _this.options.elements.handle.position().top,
                    left = _this.options.elements.handle.position().left;
                _this.$el.css('top', event.pageY - _this.offset.y);
                _this.window_info.top = event.pageY - _this.offset.y;
                _this.$el.css('left', event.pageX - _this.offset.x);
                _this.window_info.left = event.pageX - _this.offset.x;
                _this.window_info.width = _this.$el.outerWidth();
                _this.window_info.height = _this.$el.outerHeight();
            }
            if (_this.options.resizable && _this.resizing) {
                if (_this.$el.hasClass("east")) {
                    _this.$el.css('width', event.pageX - _this.window_info.left);
                }
                if (_this.$el.hasClass("west")) {

                    _this.$el.css('left', event.pageX);
                    _this.$el.css('width', _this.window_info.width + (_this.window_info.left - event.pageX));
                }
                if (_this.$el.hasClass("south")) {
                    _this.$el.css('height', event.pageY - _this.window_info.top);
                }
                if (_this.$el.hasClass("north")) {
                    _this.$el.css('top', event.pageY);
                    _this.$el.css('height', _this.window_info.height + (_this.window_info.top - event.pageY));
                }
            }
        });

        this.$el.on('mousemove', function (event) {
            if (_this.options.blocker) {
                return;
            }
            if (_this.options.resizable) {
                if (event.offsetY > _this.$el.height() - 5 || event.offsetY < 5) {
                    _this.$el.addClass('ns-resize');
                } else {
                    _this.$el.removeClass('ns-resize');
                }
                if (event.offsetX > _this.$el.width() - 5 || event.offsetX < 5) {
                    _this.$el.addClass('ew-resize');
                } else {
                    _this.$el.removeClass('ew-resize');
                }
            }
        });
    };

    Window.prototype.resize = function (options) {
        options = options || {};
        if (options.top) {
            this.$el.css('top', options.top);
        }
        if (options.left) {
            this.$el.css('left', options.left);
        }
        if (options.height) {
            this.$el.css('height', options.height);
        }
        if (options.width) {
            this.$el.css('width', options.width);
        }
        this.$el.trigger(namespace + '.resize');
    };

    Window.prototype.setBlocker = function (window_handle) {
        this.options.blocker = window_handle;
        this.$el.find('.disable-shade').remove();
        var shade = '<div class="disable-shade"></div>';
        this.options.elements.body.append(shade);
        this.options.elements.body.addClass('disable-scroll');
        this.options.elements.footer.append(shade);
        if (this.options.effect === 'fade') {
            this.$el.find('.disable-shade').fadeIn();
        } else {
            this.$el.find('.disable-shade').show();
        }

        if (!this.options.blocker.getParent()) {
            this.options.blocker.setParent(this);
        }
    };

    Window.prototype.getBlocker = function () {
        return this.options.blocker;
    };

    Window.prototype.clearBlocker = function () {
        this.options.elements.body.removeClass('disable-scroll');
        if (this.options.effect === 'fade') {
            this.$el.find('.disable-shade').fadeOut(function () {
                this.remove();
            });
        } else {
            this.$el.find('.disable-shade').hide();
            this.remove();
        }

        delete this.options.blocker;
    };

    Window.prototype.setParent = function (window_handle) {
        this.options.parent = window_handle;
        if (!this.options.parent.getBlocker()) {
            this.options.parent.setBlocker(this);
        }
    };

    Window.prototype.getParent = function () {
        return this.options.parent;
    };

    Window.prototype.blink = function () {
        var _this = this,
            active = this.$el.hasClass('active'),
            windowTab = this.getWindowTab(),
            focused = windowTab ? windowTab.hasClass('label-primary') : undefined,
            blinkInterval = setInterval(function () {
            _this.$el.toggleClass('active');
            if (windowTab) {
                windowTab.toggleClass('label-primary');
            }
        }, 250),
            blinkTimeout = setTimeout(function () {
            clearInterval(blinkInterval);
            if (active) {
                _this.$el.addClass('active');
            }
            if (windowTab && focused) {
                windowTab.addClass('label-primary');
            }
        }, 1000);
    };

    $.fn.window = function (options) {
        options = options || {};
        var newWindow,
            window_opts = $.extend({
            fromElement: this,
            selectors: {}
        }, options || {});
        if (typeof options === "object") {
            if (window_opts.selectors.handle) {
                this.find(window_opts.selectors.handle).css('cursor', 'move');
            }

            newWindow = new Window($.extend({}, window_opts, window_opts));
            //this.data('window', newWindow);

        } else if (typeof options === "string") {
            switch (options) {
                case "close":
                    this.data('window').close();
                    break;
                case "show":
                    this.data('window').show();
                    break;
                case "maximize":
                    this.data('window').maximize();
                    break;
                default:
                    break;
            }
        }

        return this;
    };

    $('[data-window-target]').off('click');
    $('[data-window-target]').on('click', function () {
        var $this = $(this),
            opts = {
            selectors: {}
        };
        if ($this.data('windowTitle')) {
            opts.title = $this.data('windowTitle');
        }

        if ($this.data('titleHandle')) {
            opts.selectors.title = $this.data('titleHandle');
        }

        if ($this.data('windowHandle')) {
            opts.selectors.handle = $this.data('windowHandle');
        }
        if ($this.data('clone')) {
            opts.clone = $this.data('windowHandle');
        }

        $($this.data('windowTarget')).window(opts);
    });
})(jQuery);
var WindowManager = null;
(function ($) {
    "use strict";

    WindowManager = function (options) {
        this.windows = [];
        options = options || {};
        this.initialize(options);
        return this;
    };

    WindowManager.prototype.findWindowByID = function (id) {
        var returnValue = null;
        $.each(this.windows, function (index, window) {
            if (window.id === id) {
                returnValue = window;
            }
        });
        return returnValue;
    };

    WindowManager.prototype.destroyWindow = function (window_handle) {
        var _this = this;
        var returnVal = false;
        $.each(this.windows, function (index, window) {
            if (window === window_handle) {
                window_handle.close();
                _this.windows.splice(index, 1);
                _this.resortWindows();
                returnVal = true;
            }
        });
        return returnVal;
    };

    WindowManager.prototype.closeWindow = WindowManager.prototype.destroyWindow;

    WindowManager.prototype.resortWindows = function () {
        var startZIndex = 900;
        $.each(this.windows, function (index, window) {
            window.setIndex(startZIndex + index);
        });
    };

    WindowManager.prototype.setFocused = function (focused_window) {
        var focusedWindowIndex;
        while (focused_window.getBlocker()) {
            focused_window = focused_window.getBlocker();
        }
        $.each(this.windows, function (index, windowHandle) {
            windowHandle.setActive(false);
            if (windowHandle === focused_window) {
                focusedWindowIndex = index;
            }
        });
        this.windows.push(this.windows.splice(focusedWindowIndex, 1)[0]);
        focused_window.setActive(true);
        this.resortWindows();
    };

    WindowManager.prototype.sendToBack = function (window) {
        var windowHandle = this.windows.splice(this.windows.indexOf(window), 1)[0];
        this.windows.unshift(windowHandle);
        this.resortWindows();
        return true;
    };

    WindowManager.prototype.initialize = function (options) {
        this.options = options;
        this.elements = {};

        if (this.options.container) {
            this.elements.container = $(this.options.container);
            this.elements.container.addClass('window-pane');
        }
    };

    WindowManager.prototype.getContainer = function () {
        var returnVal;
        if (this.elements && this.elements.container) {
            returnVal = this.elements.container;
        }
        return returnVal;
    };

    WindowManager.prototype.setNextFocused = function () {
        this.setFocused(this.windows[this.windows.length - 1]);
    };

    WindowManager.prototype.addWindow = function (window_object) {
        var _this = this;
        window_object.getElement().on('focused', function (event) {
            _this.setFocused(window_object);
        });
        window_object.getElement().on('close', function () {
            _this.destroyWindow(window_object);
            if (window_object.getWindowTab()) {
                window_object.getWindowTab().remove();
            }
        });

        window_object.on('bsw.restore', function () {
            _this.resortWindows();
        });

        if (this.options.container) {
            window_object.setWindowTab($('<span class="label label-default">' + window_object.getTitle() + '<button class="pane-close">x</button></span>'));
            window_object.getWindowTab().find('.pane-close').on('click', function (event) {
                var blocker = window_object.getBlocker();
                if (!blocker) {
                    window_object.close();
                } else {
                    blocker.blink();
                }
            });
            window_object.getWindowTab().on('click', function (event) {
                var blocker = window_object.getBlocker();
                if (!blocker) {
                    _this.setFocused(window_object);
                    if (window_object.getSticky()) {
                        window.scrollTo(0, window_object.getElement().position().top);
                    }
                } else {
                    blocker.blink();
                }
            });

            $(this.options.container).append(window_object.getWindowTab());
        }

        this.windows.push(window_object);
        window_object.setManager(this);
        this.setFocused(window_object);
        return window_object;
    };

    WindowManager.prototype.createWindow = function (window_options) {
        var _this = this;
        var final_options = Object.create(window_options);
        if (this.options.windowTemplate && !final_options.template) {
            final_options.template = this.options.windowTemplate;
        }

        var newWindow = new Window(final_options);

        return this.addWindow(newWindow);
    };
})(jQuery);