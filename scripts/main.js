// Wiki - A simple wiki base on Pageforest.
/*globals Showdown */
namespace.lookup('com.pageforest.wiki').defineOnce(function(ns) {
    var dom = namespace.lookup('org.startpad.dom');
    var client = new namespace.com.pageforest.client.Client(ns);
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
        lastMarkdown = newText;
        page.section.innerHTML = markdown.makeHtml(newText);
    }

    function toggleEditor(evt) {
        editVisible = !editVisible;
        if (editVisible) {
            $(page.editor).show();
            // Binding this in the onReady function does not work
            // since the original textarea is hidden.
            if (!editorInitialized) {
                editorInitialized = true;
                $(page.editor)
                    .bind('keyup', onEditChange)
                    .autoResize();
            }
        } else {
            $(page.editor).hide();
        }
        $(page.edit).text(editVisible ? 'hide' : 'edit');
    }

    function onReady() {
        page = dom.bindIDs();
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
