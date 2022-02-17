### webtransport-go

使用 go 实现的 webtransport，包括 client 和 server

#### 实现规范

[http3](https://datatracker.ietf.org/doc/draft-ietf-quic-http/)

[webtransport/http3](https://datatracker.ietf.org/doc/draft-ietf-webtrans-http3/)


#### 使用

server 端参照 example/server/server.go

client 端参照 example/client/client.go


#### 测试

1. npm install

2. go run ./example/server/server.go

3. go run ./example/client/client.go

4. npm run serve

5. 使用参数启动 chrome:  open /Applications/Google\ Chrome.app --args \
    --ignore-certificate-errors-spki-list=TRgIbuesxs2xFZh+JJA/AIVnRtm75eLUMMPFKMMm2Fk= \
    --origin-to-force-quic-on=localhost:4433 --blink-platform-log-channels \
    --ignore-certificate-errors

6. 访问 https://localhost:9000

#### Features

- [x] server
- [x] client