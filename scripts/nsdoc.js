/*jslint evil:true */
require('org.startpad.funcs').patch();
var base = require('org.startpad.base');
var format = require('org.startpad.format');
var string = require('org.startpad.string').patch();
var ut = require('com.jquery.qunit');

exports.extend({
    'namespaceDoc': namespaceDoc,
    'updateScriptSections': updateScriptSections,
    'updateChallenges': updateChallenges
});

var reArgs = /^function\s+\S*\(([^\)]*)\)/;
var reFuncName = /function\s+(\S+)\s*\(/;
var reComma = /\s*,\s/;

var WRITE_LIMIT = 1000;

function functionDoc(name, func) {
    var s = new base.StBuf();
    var level = name.split('.').length;

    s.append(format.repeat('#', level) + ' *' + name + '*(');

    var args = reArgs.exec(func.toString());
    if (args === null) {
        return "error reading function: " + name + '\n';
    }
    args = args[1].split(reComma);
    var sep = '';
    if (args.length > 1 || args[0] != '') {
        s.append('*' + args.join('*, *') + '*');
        sep = ', ';
    }
    if (func.toString().indexOf('arguments') != -1) {
        s.append(sep + '...');
    }
    s.append(')\n');

    name = name[0].toLowerCase() + name.slice(1);
    for (var methodName in func.prototype) {
        if (typeof func.prototype[methodName] == 'function') {
            var method = func.prototype[methodName];
            s.append(functionDoc(name + '.' + methodName, method));
        }
    }

    return s.toString();
}

function getFunctionName(func) {
    if (typeof func != 'function') {
        return "notAFunction";
    }
    var result = reFuncName.exec(func.toString());
    if (result == null) {
        return "anonymous";
    }
    return result[1];
}

function namespaceDoc(ns) {
    var s = new base.StBuf();

    for (var name in ns) {
        if (ns.hasOwnProperty(name)) {
            var func = ns[name];
            if (typeof func != 'function' || name == '_closure') {
                continue;
            }

            s.append(functionDoc(name, func));
        }
    }
    return s.toString();
}

/*
   Update embedded <script> sections and insert markdown-formatted
   blocks to display them.

   REVIEW: Injecting script into DOM executes on Firefox?  Need to disable.
*/
function updateScriptSections(context) {
    var domScripts = $('script', context);
    var scripts = [];
    var i, j;
    var script;

    for (i = 0; i < domScripts.length; i++) {
        if (domScripts[i].className != '') {
            continue;
        }
        script = {script: domScripts[i],
                  fragments: [],
                  values: [],
                  lines: base.strip(domScripts[i].innerHTML).split('\n'),
                  max: 0
                 };
        scripts.push(script);
        var jBegin = 0;
        for (j = 0; j < script.lines.length; j++) {
            if (j != script.lines.length - 1 &&
                !/^\S.*;\s*$/.test(script.lines[j])) {
                continue;
            }
            script.fragments[j] = base.strip(script.lines.slice(jBegin, j + 1).join('\n'));
            script.max = Math.max(script.lines[j].length, script.max);
            jBegin = j + 1;
        }
    }

    evalScripts(scripts);

    for (i = 0; i < scripts.length; i++) {
        script = scripts[i];
        for (j = 0; j < script.lines.length; j++) {
            if (script.comments[j]) {
                script.lines[j] += format.repeat(' ', script.max - script.lines[j].length + 2) +
                    script.comments[j];
            }
        }
        $(script.script).before('<pre><code>' +
                                format.escapeHTML(script.lines.join('\n')) +
                                '</code></pre>');
        if (script.writes.length > 0) {
            $(script.script).after('<pre class="printed"><code>' +
                                   format.escapeHTML(script.writes.join('\n')) +
                                   '</code></pre>');
        }
    }
}

// Evaluate all script fragments in one function so variables set will
// carry over to subsequent fragments.  Avoid using common variable names
// that might be used by eval'ed code.
function evalScripts(_scripts) {
    var _script;
    var _value;
    var _i, _line;

    function write() {
        var args = Array.prototype.slice.call(arguments, 1);
        var s = string.format(arguments[0], args);
        while (s.length > 80) {
            _script.writes.push(s.slice(0, 80));
            s = s.slice(80);
        }
        _script.writes.push(s);
    }

    for (_i = 0; _i < _scripts.length; _i++) {
        _script = _scripts[_i];

        _script.writes = [];
        _script.comments = [];
        for (_line = 0; _line < _script.fragments.length; _line++) {
            if (!_script.fragments[_line]) {
                continue;
            }
            try {
                _value = eval(_script.fragments[_line]);
            } catch (_e) {
                _value = _e;
            }
            _script.comments[_line] = commentFromValue(_value);
        }
    }
}

function commentFromValue(value) {
    if (value == undefined) {
        return undefined;
    }
    if (value instanceof Error) {
        return "// Exception: " + value.message;
    }
    switch (typeof value) {
    case 'string':
        value = '"' + value + '"';
        value.replace(/"/g, '""');
        break;
    case 'function':
        value = "function " + getFunctionName(value);
        break;
    case 'object':
        if (value === null) {
            value = "null";
        } else {
            var prefix = getFunctionName(value.constructor) + ': ';
            try {
                value = prefix + JSON.stringify(value);
            } catch (e) {
                value += prefix + "{...}";
            }
        }
    }
    return '// ' + value.toString();
}

var tester;
var hangTimer;

function updateChallenges(context) {
    var challenges = $('script.challenge', context);
    var tests = [];
    var printed;

    console.log("updateChallenges");

    function onChallengeChange(i) {
        var test = tests[i];
        var code = test.textarea.value;
        if (code == test.codeLast) {
            return;
        }
        test.codeLast = code;

        $('#test_' + i).empty();
        $('#print_' + i).addClass('unused');
        $('code', '#print_' + i).empty();
        test.sep = '';
        test.writes = 0;
        if (hangTimer) {
            clearTimeout(hangTimer);
            hangTimer = undefined;
        }

        function terminateTest() {
            clearTimeout(hangTimer);
            hangTimer = undefined;
            tester.terminate();
            tester = undefined;
        }

        try {
            if (tester) {
                tester.terminate();
            }
            $('#test_' + i).append('<div class="test-status">Loading code.</div>');
            tester = new Worker('tester-all.js');
            tester.postMessage({challenge: i,
                                code: test.prefix + code + test.suffix,
                                test: test.testCode});
            hangTimer = setTimeout(function () {
                var $results = $('#test_' + i);
                $results.append('<div class="test-status">You may have an ' +
                                '<a target="_blank" ' +
                                'href="http://en.wikipedia.org/wiki/Infinite_loop">' +
                                'infinite loop</a>...' +
                                '</div>');
            }, 10000);
            tester.onmessage = function (event) {
                // { challenge: number, type: 'start'/'test'/'done'/'error',
                //   info: {result: string, message: string} }
                var data = event.data;
                var $results = $('#test_' + data.challenge);
                switch (data.type) {
                case 'start':
                    $results.append('<div class="test-status">Running tests.</div>');
                    break;
                case 'error':
                    $results.append('<div class="test-status FAIL">Code error: {0}</div>'
                                    .format(data.info.message));
                    terminateTest();
                    break;
                case 'done':
                    $results.append(('<div class="test-status {0}">Test Complete: ' +
                                     '{1} correct out of {2} tests.</div>')
                                    .format(
                                        data.info.failed > 0 ? 'FAIL' : 'PASS',
                                        data.info.passed,
                                        data.info.total));
                    terminateTest();
                    break;
                case 'test':
                    $results.append('<div class="test {0}">{0}: {1}<div>'
                                    .format(data.info.result ? 'PASS' : 'FAIL', data.info.message));
                    break;
                case 'write':
                    if (++test.writes > WRITE_LIMIT) {
                        $('code', '#print_' + i).append(test.sep + "Write Limit Exceeded.");
                        $results.append('<div class="test FAIL">ABORTED: ' +
                                        'Write Limit Exceeeded.<div>');
                        terminateTest();
                        return;
                    }
                    $('#print_' + i).removeClass('unused');
                    $('code', '#print_' + i).append(test.sep + format.escapeHTML(data.message));
                    test.sep = '\n';
                    break;
                }
            };
        } catch (e) {
            $('#test_' + i).append('<div class="test FAIL">{0}<div>'.format(e.toString()));
        }
    }

    for (var i = 0; i < challenges.length; i++) {
        var challenge = challenges[i];
        // Psuedo-XML (CDATA parsing not working)
        var xml = $(challenge).text();
        tests[i] = {
            prefix: getXMLText('prefix', xml),
            suffix: getXMLText('suffix', xml),
            testCode: getXMLText('test', xml),
            sep: ''
        };
        var code = getXMLText('code', xml);
        $(challenge).after('<textarea id="challenge_{0}" class="challenge"></textarea>'
                           .format(i));
        $(challenge).remove();
        var textarea = tests[i].textarea = $('#challenge_' + i)[0];
        $(textarea)
            .val(code)
            .bind('keyup', onChallengeChange.curry(i))
            .autoResize({limit: 1000});
        $(textarea).after('<pre id="print_{0}" class="printed unused"><code></code></pre>'
                           .format(i));
        $(textarea).after('<pre class="test-results" id="test_{0}"></pre>'.format(i));

        onChallengeChange(i);
    }
}

function getXMLText(tag, s) {
    var start = s.indexOf('<{0}>'.format(tag));
    var end = s.indexOf('</{0}>'.format(tag));
    if (start == -1 || end == -1) {
        return '';
    }
    return trimCode(s.slice(start + tag.length + 2, end));
}

function trimCode(s) {
    s = s.replace(/^\n+|\s+$/g, '');
    var match = /^\s+/.exec(s);
    if (match) {
        var pre = new RegExp('^\\s{' + match[0].length + '}');
        var lines = s.split('\n');
        for (var i = 0; i < lines.length; i++) {
            lines[i] = lines[i].replace(pre, '');
        }
        s = lines.join('\n');
    }
    return s + '\n';
}

