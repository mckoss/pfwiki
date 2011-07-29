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
    var scripts = $('script', context);
    var e;
    var printed;

    console.log("updateScriptSections");
    function write() {
        var args = Array.prototype.slice.call(arguments, 1);
        var s = string.format(arguments[0], args);
        while (s.length > 80) {
            printed.push(s.slice(0, 80));
            s = s.slice(80);
        }
        printed.push(s);
    }

    for (var i = 0; i < scripts.length; i++) {
        var script = scripts[i];
        if (script.className != '') {
            continue;
        }
        printed = [];
        var body = base.strip(script.innerHTML);
        var lines = body.split('\n');
        var comments = [];
        var max = 0;
        var jBegin = 0;
        for (var j = 0; j < lines.length; j++) {
            if (j != lines.length - 1 &&
                !/^\S.*;\s*$/.test(lines[j])) {
                comments[j] = '';
                continue;
            }
            var batch = lines.slice(jBegin, j + 1).join('\n');
            batch = base.strip(batch);
            try {
                console.log("eval: '" + batch + "'");
                var value = evalExpression(batch, write);
                if (value == undefined) {
                    comments[j] = '';
                } else {
                    if (typeof value == 'string') {
                        value = '"' + value + '"';
                        value.replace(/"/g, '""');
                    }
                    if (typeof value == 'function') {
                        value = "function " + getFunctionName(value);
                    }
                    if (typeof value == 'object') {
                        if (value === null) {
                            value = "null";
                        } else {
                            var prefix = getFunctionName(value.constructor) + ': ';
                            try {
                                value = prefix + JSON.stringify(value);
                            } catch (e3) {
                                value += prefix + "{...}";
                            }
                        }
                    }
                    comments[j] = '// ' + value.toString();
                }
            } catch (e2) {
                comments[j] = "// Exception: " + e2.message;
            }
            max = Math.max(lines[j].length, max);
            jBegin = j + 1;
        }

        for (j = 0; j < lines.length; j++) {
            if (comments[j] != "") {
                lines[j] += format.repeat(' ', max - lines[j].length + 2) + comments[j];
            }
        }
        body = lines.join('\n');
        $(script).before('<pre><code>' + format.escapeHTML(body) + '</code></pre>');
        if (printed.length > 0) {
            $(script).after('<pre class="printed"><code>' +
                            format.escapeHTML(printed.join('\n')) +
                            '</code></pre>');
        }
    }
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

function evalExpression(code, write) {
    return eval(code);
}
