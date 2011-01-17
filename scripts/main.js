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
    var maxHeight = 1024;
    
    function resizeEdit() {
        if (editVisible) {
            var targetHeight = Math.min(maxHeight, page.editor.scrollHeight - 4);
            if ($(page.editor).height() < targetHeight) {
                console.log("Growing to " + targetHeight);
                $(page.editor).height(targetHeight);
            }
        }
    }

    function onEdit(evt) {
        editVisible = !editVisible;
        if (editVisible) {
            $(page.editor).show();
            resizeEdit();
        } else {
            $(page.editor).height(50).hide();
        }
        $(page.edit).text(editVisible ? 'hide' : 'edit');
    }
    
    function onEditChange() {
        if (page.editor.value == lastMarkdown) {
            return;
        }
        resizeEdit();
        lastMarkdown = page.editor.value;
        page.section.innerHTML = markdown.makeHtml(lastMarkdown);
    }
    
    function onReady() {
        page = dom.bindIDs();
        client.addAppBar();

        $(page.edit).click(onEdit);
        $(page.editor).bind('keydown', function() {console.log('keydown'); onEditChange();});
        
        setInterval(onEditChange, syncTime * 1000);
    }

    function updateMeta(json) {
        document.title = json.title;
        $('#title').text(json.title);
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
