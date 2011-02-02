/*
 Create documentation from a JavaScript namespace.
 */
/*jslint evil:true */
namespace.lookup('org.startpad.nsdoc').defineOnce(function(ns)
{
    var base = namespace.lookup('org.startpad.base');
    var format = namespace.lookup('org.startpad.format');
    var reArgs = /^function\s+\S*\(([^\)]*)\)/;
    var reComma = /\s*,\s/;

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

       <script class="eval-lines"> can be used to eval each line and
       append a comment with the returned value.
    */
    function updateScriptSections(context) {
        var scripts = $('script', context);
        var e;

        for (var i = 0; i < scripts.length; i++) {
            var script = scripts[i];
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
                    var value = eval(batch);
                    if (value == undefined) {
                        comments[j] = '';
                    } else {
                        if (typeof value == 'string') {
                            value = '"' + value + '"';
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
            $(script).before('<pre><code>' + body + '</code></pre>');
        }
    }

    ns.extend({
        'namespaceDoc': namespaceDoc,
        'updateScriptSections': updateScriptSections
    });

});