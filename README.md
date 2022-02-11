### webtransport-go

使用 go 实现的 webtransport，包括 client 和 server

#### 使用

server 端参照 example/main.go


#### 测试

1. npm install

2. go run ./example/main.go

3. npm run serve

4. 使用参数启动 chrome:  open /Applications/Google\ Chrome.app --args \
    --ignore-certificate-errors-spki-list=TRgIbuesxs2xFZh+JJA/AIVnRtm75eLUMMPFKMMm2Fk= \
    --origin-to-force-quic-on=172.31.100.22:4433 --blink-platform-log-channels \
    --ignore-certificate-errors

5. 访问 https://localhost:9000

#### Features

- [x] server
- [ ] client