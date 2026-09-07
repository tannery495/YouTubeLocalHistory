(function() {
    'use strict';

    function createContentInfoHelpers(dependencies) {
        const log = dependencies.log;
        const storage = dependencies.storage;

        function showExtensionInfo() {
            // Intentionally silent. Watch-progress tracking continues in the
            // background without injecting an informational popup into YouTube.
        }

        return {
            showExtensionInfo
        };
    }

    window.YTVHTContentInfo = {
        create: createContentInfoHelpers
    };
})();
