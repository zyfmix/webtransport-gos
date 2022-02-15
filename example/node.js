const https = require('https');
const fs = require('fs');
const WebSocket = require('ws');
const WebSocketServer = WebSocket.Server;

const options = {
    key: fs.readFileSync(__dirname + '/server.key'),
    cert: fs.readFileSync(__dirname + '/server.crt'),
};

const server = https.createServer(options).listen(8121);
const wss = new WebSocketServer({
    server: server,
    path: '/room'
});

wss.on('connection', function(ws) {
    ws.on('message', function(message) {
        console.log('requset: ' + message);
        ws.send(message);
    });

    ws.on('error', (error) => {
        console.log(error);
    });
});
