var CODE_MIRROR_OP_SOURCE = 'CodeMirror';

function ShareDBCodeMirror(codeMirror, options) {
  this.codeMirror = codeMirror;
  this.verbose = Boolean(options.verbose);
  this.onOp = options.onOp;
  this.onStart = options.onStart || function () {};
  this.onStop = options.onStop || function () {};

  this._started = false;
  this._suppressChange = false;
  this._changeListener = this._handleChange.bind(this);
}

ShareDBCodeMirror.attachDocToCodeMirror = function (shareDoc, codeMirror, options, callback) {
  var shareDBCodeMirror = new ShareDBCodeMirror(codeMirror, {
    onStart: function () {
      shareDoc.on('op', shareDBOpListener);
    },
    onStop: function () {
      shareDoc.removeListener('op', shareDBOpListener);
    },
    onOp: function (op, source) {
      shareDoc.submitOp(op, source);
    }
  });

  function shareDBOpListener(op, source) {
    if (source) {
      return;
    }
    shareDBCodeMirror.applyOp(op, source);
  }

  shareDoc.subscribe(function (err) {
    if (err) {
      if (callback) {
        callback(err);
        return;
      } else {
        throw err;
      }
    }

    shareDBCodeMirror.setValue(shareDoc.data || '');

    if (callback) {
      callback(null);
    }
  });

  return shareDBCodeMirror;
};

ShareDBCodeMirror.prototype.start = function () {
  if (this._started) {
    return;
  }
  this.codeMirror.on('change', this._changeListener);
  this._started = true;
  this.onStart();
};

ShareDBCodeMirror.prototype.setValue = function (text) {
  if (!this._started) {
    this.start();
  }
  this._suppressChange = true;
  this.codeMirror.setValue(text);
  this._suppressChange = false;
};

ShareDBCodeMirror.prototype.getValue = function () {
  return this.codeMirror.getValue();
};

ShareDBCodeMirror.prototype.assertValue = function (expectedValue) {
  var editorValue = this.codeMirror.getValue();

  if (expectedValue !== editorValue) {
    console.error(
      "Value in CodeMirror doesn't match expected value:\n\n",
      "Expected Value:\n", expectedValue,
      "\n\nEditor Value:\n", editorValue);

    this._suppressChange = true;
    this.codeMirror.setValue(expectedValue);
    this._suppressChange = false;

    return false;
  }

  return true;
};

ShareDBCodeMirror.prototype.applyOp = function (op, source) {
  if (source === undefined) {
    throw new Error("The 'source' argument must be provided");
  }

  if (!Array.isArray(op)) {
    throw new Error("Unexpected non-Array op for text document");
  }

  if (!this._started) {
    if (this.verbose) {
      console.log('ShareDBCodeMirror: op received while not running, ignored', op);
    }
    return;
  }

  if (source === CODE_MIRROR_OP_SOURCE) {
    if (this.verbose) {
      console.log('ShareDBCodeMirror: skipping local op', op);
    }
    return;
  }

  if (this.verbose) {
    console.log('ShareDBCodeMirror: applying op', op);
  }

  this._suppressChange = true;
  this._applyChangesFromOp(op);
  this._suppressChange = false;
};

/**
 * Stops listening for changes from the CodeMirror instance.
 */
ShareDBCodeMirror.prototype.stop = function () {
  if (!this._started) {
    return;
  }
  this.codeMirror.off('change', this._changeListener);
  this._started = false;
  this.onStop();
};

ShareDBCodeMirror.prototype._applyChangesFromOp = function (op) {
  var textIndex = 0;
  var codeMirror = this.codeMirror;

  op.forEach(function (part) {
    switch (typeof part) {
      case 'number': // skip n chars
        textIndex += part;
        break;
      case 'string': // "chars" - insert "chars"
        codeMirror.replaceRange(part, codeMirror.posFromIndex(textIndex));
        textIndex += part.length;
        break;
      case 'object': // {d: num} - delete `num` chars
        var from = codeMirror.posFromIndex(textIndex);
        var to = codeMirror.posFromIndex(textIndex + part.d);
        codeMirror.replaceRange('', from, to);
        break;
    }
  });
};

ShareDBCodeMirror.prototype._handleChange = function (codeMirror, change) {
  if (this._suppressChange) {
    return;
  }

  var op = this._createOpFromChange(change);

  if (this.verbose) {
    console.log('ShareDBCodeMirror: produced op', op);
  }

  this.onOp(op, CODE_MIRROR_OP_SOURCE);
};

ShareDBCodeMirror.prototype._createOpFromChange = function (change) {
  var codeMirror = this.codeMirror;
  var op = [];
  var textIndex = 0;
  var startLine = change.from.line;

  for (var i = 0; i < startLine; i++) {
    textIndex += codeMirror.lineInfo(i).text.length + 1; // + 1 for '\n'
  }

  textIndex += change.from.ch;

  if (textIndex > 0) {
    op.push(textIndex); // skip textIndex chars
  }

  if (change.to.line !== change.from.line || change.to.ch !== change.from.ch) {
    var delLen = 0;
    var numLinesRemoved = change.removed.length;

    for (var i = 0; i < numLinesRemoved; i++) {
      delLen += change.removed[i].length + 1; // +1 for '\n'
    }

    delLen -= 1; // last '\n' shouldn't be included

    op.push({
      d: delLen
    }) // delete delLen chars
  }

  if (change.text) {
    var text = change.text.join('\n');
    if (text) {
      op.push(text); // insert text
    }
  }

  return op;
};