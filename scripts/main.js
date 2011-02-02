// Wiki - A simple wiki base on Pageforest.
/*globals Showdown */
namespace.lookup('com.pageforest.wiki').defineOnce(function(ns) {
    var dom = namespace.lookup('org.startpad.dom');
    var nsdoc = namespace.lookup('org.startpad.nsdoc');
    var client;
    var markdown = new Showdown.converter();

    var page;
    var lastMarkdown = "";
    var syncTime = 5;
    var editVisible = false;
    var editorInitialized = false;

    function onEditChange() {
        var newText = page.editor.value;
        if (newText == lastMarkdown) {
            return;
        }
        client.setDirty();
        lastMarkdown = newText;
        try {
            page.output.innerHTML = markdown.makeHtml(newText);
            nsdoc.updateScriptSections(page.output);
        } catch (e) {}
    }

    function toggleEditor(evt) {
        editVisible = !editVisible;
        if (editVisible) {
            $(page.inputBlock).show();
            // Binding this in the onReady function does not work
            // since the original textarea is hidden.
            if (!editorInitialized) {
                editorInitialized = true;
                $(page.editor)
                    .bind('keyup', onEditChange)
                    .autoResize({limit: (screen.height - 100) / 2});
            }
        } else {
            $(page.inputBlock).hide();
        }
        $(page.edit).val(editVisible ? 'hide' : 'edit');
    }

    function onReady() {
        page = dom.bindIDs();
        client = new namespace.com.pageforest.client.Client(ns);
        client.saveInterval = 0;

        client.addAppBar();

        $(page.edit).click(toggleEditor);

        setInterval(onEditChange, syncTime * 1000);
    }

    function updateMeta(json) {
        document.title = json.title;
        $('#title').text(json.title);
    }

    function onSaveSuccess(json) {
        updateMeta(client.meta);
    }

    function setDoc(json) {
        page.editor.value = json.blob.markdown;
        onEditChange();
        updateMeta(json);
    }

    function getDoc() {
        return {
            blob: {
                version: 1,
                markdown: page.editor.value
            },
            readers: ['public']
        };
    }

    ns.extend({
        'onReady': onReady,
        'getDoc': getDoc,
        'setDoc': setDoc,
        'onSaveSuccess': onSaveSuccess
    });
});
