// Wiki - A simple wiki base on Pageforest.
namespace.lookup('com.pageforest.wiki').defineOnce(function(ns) {
    var client;

    function onReady() {
        client = new namespace.com.pageforest.client.Client(ns);
        client.addAppBar();
    }

    function setDoc(json) {
        $('#home').text(json.blob.homeText);
    }

    function getDoc() {
        return {
            "blob": {
                version: 0,
                homeText: $('#home').text()
            }
        };
    }

    ns.extend({
        'onReady': onReady,
        'getDoc': getDoc,
        'setDoc': setDoc
    });
});
