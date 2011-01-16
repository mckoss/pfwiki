// Wiki - A simple wiki base on Pageforest.
namespace.lookup('com.pageforest.wiki').defineOnce(function(ns) {
    var dom = namespace.lookup('org.startpad.dom');
    var client = new namespace.com.pageforest.client.Client(ns);
    var markdown = new Showdown.converter();
    
    var parts;
    
    function onEdit(evt) {
        $(parts['section-edit']).toggle('3s');
    }

    function onReady() {
        parts = dom.bindIDs();
        client.addAppBar();

        $(parts.edit).click(onEdit);
    }

    function setDoc(json) {
        $('#section').html(markdown.makeHtml(json.blob.markdown));
        $('#section-edit').val(json.blob.markdown);
        updateMeta(json);
    }
    
    function updateMeta(json) {
        document.title = json.title;
        $('#title').text(json.title);
    }

    function getDoc() {
        return {
            blob: {
                version: 1,
                markdown: $('#section-edit').val()
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
