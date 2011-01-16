// Wiki - A simple wiki base on Pageforest.
/*globals Showdown */
namespace.lookup('com.pageforest.wiki').defineOnce(function(ns) {
    var dom = namespace.lookup('org.startpad.dom');
    var client = new namespace.com.pageforest.client.Client(ns);
    var markdown = new Showdown.converter();

    var parts;
    var lastMarkdown = "";
    var syncTime = 5;
    
    function onEdit(evt) {
        $(parts['section-edit']).toggle('3s');
    }

    function onEditChange() {
        if (parts['section-edit'].value == lastMarkdown) {
            return;
        }
        lastMarkdown = parts['section-edit'].value;
        parts.section.innerHTML = markdown.makeHtml(lastMarkdown);
    }
    
    function onReady() {
        parts = dom.bindIDs();
        client.addAppBar();

        $(parts.edit).click(onEdit);
        $(parts['section-edit']).keydown(onEditChange);
        
        setInterval(onEditChange, syncTime * 1000);
    }

    function updateMeta(json) {
        document.title = json.title;
        $('#title').text(json.title);
    }

    function setDoc(json) {
        parts['section-edit'].value = json.blob.markdown;
        onEditChange();
        updateMeta(json);
    }
    
    function getDoc() {
        return {
            blob: {
                version: 1,
                markdown: parts['section-edit'].value
            },
            readers: ['public']
        };
    }
    
    function onSaveSuccess(json) {
        updateMeta(client.meta);
    }

    ns.extend({
        'onReady': onReady,
        'getDoc': getDoc,
        'setDoc': setDoc,
        'onSaveSuccess': onSaveSuccess
        
    });
});
