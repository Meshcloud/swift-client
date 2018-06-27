"use strict";

const createHmac = require('create-hmac');
const SwiftEntity = require('./SwiftEntity');
const url = require('url');

function swiftCliCompatibleEncodeURI(str) {
    // see https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/encodeURIComponent
    return encodeURI(str).replace(/[!'()*]/g, function (c) {
        return '%' + c.charCodeAt(0).toString(16);
    });
}

class SwiftAccount extends SwiftEntity {
    // Note: radosgw does currently not support setting temp-url keys at the container level
    // so we support setting the tmp-url key at the account level here
    // See http://tracker.ceph.com/issues/20862

    constructor(authenticator) {
        super('Account', null, authenticator);
    }

    meta() {
        return super.meta('');
    }

    update(meta, extra) {
        return super.update('', meta, extra);
    }

    async tempUrl(container, object, expires) {
        const auth = await this.authenticator.authenticate();
        const meta = await this.meta();
        const tempUrlKey = meta['temp-url-key'];

        if (!tempUrlKey) {
            throw new Error('Account has no temp-url-key defined');
        }
        const objectPath = `${container}/${object}`;
        const objectUrl = new url.URL(`${auth.url}/${objectPath}`);

        // note: the /swift/v1/ handling here contradicts docs at http://docs.ceph.com/docs/master/radosgw/swift/tempurl/#get-temp-url-objects
        // However, it works and matches the openstack swift cli output, so we'll stick to that
        // See also this source note which indicates newer versions of radosgw support both: https://github.com/ceph/ceph/blob/v12.1.3/src/rgw/rgw_swift_auth.cc#L283

        const hmacBody = 'GET' + '\n' + expires + '\n' + objectUrl.pathname;
        const sig = createHmac('sha1', tempUrlKey).update(hmacBody).digest('hex');

        // note: filenames may contain further "path" prefixes in the object name, extract this from the last path segment
        const filename = objectPath.substr(objectPath.lastIndexOf('/') + 1);

        const tempUrl = `${objectUrl.origin}${objectUrl.pathname}?temp_url_sig=${sig}&temp_url_expires=${expires}&filename=${filename}`;

        // note: this type of URI encoding matches what the openstack swift cli does
        return swiftCliCompatibleEncodeURI(tempUrl);
    }

}

module.exports = SwiftAccount;