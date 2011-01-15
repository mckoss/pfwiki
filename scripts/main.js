// Wiki - A simple wiki base on Pageforest.
namespace.lookup('com.pageforest.wiki').defineOnce(function(ns) {
    var client;
    var markdown;

    function onReady() {
        client = new namespace.com.pageforest.client.Client(ns);
        markdown = new Showdown.converter();
        client.addAppBar();
    }

    function setDoc(json) {
        $('#section').html(markdown.makeHtml(json.blob.markdown));
        $('#section-edit').val(json.blob.markdown);
        document.title = json.title;
        $('#title').text(json.title);
    }

    function getDoc() {
        return {
            "blob": {
                version: 1,
                markdown: $('#section-edit').val()
            }
        };
    }

    ns.extend({
        'onReady': onReady,
        'getDoc': getDoc,
        'setDoc': setDoc
    });
});
