var fs = require('fs');
var path = require('path');

exports.port = 9000;
exports.protocol = 'https';
exports.tlsOptions = {
    key: fs.readFileSync(path.join(__dirname, '/../data/certs/baijiayun.com.key')),
    cert: fs.readFileSync(path.join(__dirname, '/../data/certs/baijiayun.com.crt'))
};
exports.directoryIndexes = true;
exports.documentRoot = __dirname;

exports.getLocations = function () {
    return [
        {
            location: /\/$/,
            handler: home( 'index.html' )
        },
        {
            location: /^\/redirect-local/,
            handler: redirect('redirect-target', false)
        },
        {
            location: /^\/redirect-remote/,
            handler: redirect('http://www.baidu.com', false)
        },
        {
            location: /^\/redirect-target/,
            handler: content('redirectd!')
        },
        {
            location: '/empty',
            handler: empty()
        },
        {
            location: /\.css($|\?)/,
            handler: [
                autocss()
            ]
        },
        {
            location: /\.less($|\?)/,
            handler: [
                file(),
                less()
            ]
        },
        {
            location: /\.styl($|\?)/,
            handler: [
                file(),
                stylus()
            ]
        },
        {
            location: /^.*$/,
            handler: [
                // cors
                function(context) {
                    context.header['access-control-allow-origin'] = '*';
                },
                file(),
                proxyNoneExists()
            ]
        }
    ];
};

exports.injectResource = function ( res ) {
    for ( var key in res ) {
        global[ key ] = res[ key ];
    }
};
